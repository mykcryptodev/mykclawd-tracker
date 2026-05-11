import { db } from "../../db/client";
import {
  transfers,
  transactions,
  tokens,
  lots,
  dailySnapshots,
} from "../../db/schema";
import { getPriceForDate } from "../ingest/prices";
import { processInbound, processOutbound, processGas, type Lot } from "./wavg";
import { NATIVE_TOKEN_ADDRESS } from "../rpc";
import { eq } from "drizzle-orm";

function tsToDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function humanAmount(rawAmount: string, decimals: number): number {
  const raw = BigInt(rawAmount);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

export async function computePnl(): Promise<void> {
  // Load all tokens (for decimals)
  const allTokens = db.select().from(tokens).all();
  const tokenMeta = new Map(
    allTokens.map((t) => [
      t.contractAddress,
      { decimals: t.decimals, isPriced: t.isPriced, symbol: t.symbol },
    ])
  );

  // Load all transfers sorted chronologically
  const allTransfers = db
    .select()
    .from(transfers)
    .all()
    .sort((a, b) => a.blockTimestamp - b.blockTimestamp);

  // Load gas data
  const txGasMap = new Map(
    db.select().from(transactions).all()
      .filter((t) => t.gasEthWei !== "0")
      .map((t) => [t.txHash, t])
  );

  // Initialize lots state
  const lotState = new Map<string, Lot>();
  function getLot(address: string): Lot {
    return lotState.get(address) ?? { quantity: 0, avgCostUsd: 0, realizedPnlUsd: 0 };
  }

  // Collect day-end state for snapshots
  const dailyLots = new Map<string, Map<string, Lot>>(); // date → tokenAddress → lot

  let lastDate = "";

  const totalTransfers = allTransfers.length;
  let processed = 0;

  for (const transfer of allTransfers) {
    processed++;
    if (processed % 500 === 0 || processed === totalTransfers) {
      console.log(`  ${processed}/${totalTransfers} transfers replayed`);
    }
    const date = tsToDate(transfer.blockTimestamp);
    const tokenAddr = transfer.tokenAddress ?? NATIVE_TOKEN_ADDRESS;
    const meta = tokenMeta.get(tokenAddr);
    if (!meta?.isPriced) continue; // skip unpriced tokens

    const amount = humanAmount(transfer.rawAmount, meta.decimals);
    const priceUsd = getPriceForDate(tokenAddr, date);
    if (priceUsd === 0) continue; // no price data for this date — skip event

    let lot = getLot(tokenAddr);

    if (transfer.direction === "in") {
      const { lot: newLot } = processInbound(lot, amount, priceUsd);
      lot = newLot;
    } else {
      const { lot: newLot } = processOutbound(lot, amount, priceUsd);
      lot = newLot;
    }

    lotState.set(tokenAddr, lot);

    // Track gas for this tx (only if ETH lot and tx is originated by our wallet)
    const gasTx = txGasMap.get(transfer.txHash);
    if (gasTx && tokenAddr !== NATIVE_TOKEN_ADDRESS) {
      // Gas already handled below when processing the ETH lot
    }

    if (date !== lastDate) {
      lastDate = date;
    }

    // Snapshot daily state
    dailyLots.set(date, new Map(lotState));
  }

  // Also process gas deductions separate from ERC-20 transfers
  const ethMeta = tokenMeta.get(NATIVE_TOKEN_ADDRESS);
  for (const gasTx of txGasMap.values()) {
    const date = tsToDate(gasTx.blockTimestamp || 0);
    if (!ethMeta?.isPriced) continue;
    const ethAmount = humanAmount(gasTx.gasEthWei, 18);
    const ethPrice = getPriceForDate(NATIVE_TOKEN_ADDRESS, date);
    if (ethPrice === 0 || ethAmount === 0) continue;

    const lot = getLot(NATIVE_TOKEN_ADDRESS);
    const { lot: newLot } = processGas(lot, ethAmount, ethPrice);
    lotState.set(NATIVE_TOKEN_ADDRESS, newLot);
  }

  // Persist lot state
  for (const [tokenAddress, lot] of lotState.entries()) {
    db.insert(lots)
      .values({
        tokenAddress,
        quantity: lot.quantity.toString(),
        avgCostUsd: lot.avgCostUsd,
        realizedPnlUsd: lot.realizedPnlUsd,
      })
      .onConflictDoUpdate({
        target: lots.tokenAddress,
        set: {
          quantity: lot.quantity.toString(),
          avgCostUsd: lot.avgCostUsd,
          realizedPnlUsd: lot.realizedPnlUsd,
        },
      })
      .run();
  }

  // Compute and persist daily snapshots
  const today = new Date().toISOString().slice(0, 10);
  for (const [date, dayLots] of dailyLots.entries()) {
    if (date > today) continue;

    let totalValueUsd = 0;
    let totalCostBasisUsd = 0;
    let unrealizedPnlUsd = 0;
    let realizedPnlUsdCum = 0;

    for (const [tokenAddress, lot] of dayLots.entries()) {
      const priceUsd = getPriceForDate(tokenAddress, date);
      const value = lot.quantity * priceUsd;
      const costBasis = lot.quantity * lot.avgCostUsd;

      totalValueUsd += value;
      totalCostBasisUsd += costBasis;
      unrealizedPnlUsd += value - costBasis;
      realizedPnlUsdCum += lot.realizedPnlUsd;
    }

    db.insert(dailySnapshots)
      .values({
        date,
        totalValueUsd,
        totalCostBasisUsd,
        unrealizedPnlUsd,
        realizedPnlUsdCum,
      })
      .onConflictDoUpdate({
        target: dailySnapshots.date,
        set: {
          totalValueUsd,
          totalCostBasisUsd,
          unrealizedPnlUsd,
          realizedPnlUsdCum,
        },
      })
      .run();
  }
}

// Recompute today's daily snapshot from the current lots table.
// Call this after any lot quantity overrides (e.g. ETH balance correction).
export function recomputeTodaySnapshot(): void {
  const today = new Date().toISOString().slice(0, 10);
  const allLots = db.select().from(lots).all();
  const tokenLiqMap = new Map(
    db.select({ contractAddress: tokens.contractAddress, liquidityUsd: tokens.liquidityUsd })
      .from(tokens)
      .all()
      .map((t) => [t.contractAddress, t.liquidityUsd])
  );

  let totalValueUsd = 0;
  let totalCostBasisUsd = 0;
  let unrealizedPnlUsd = 0;
  let realizedPnlUsdCum = 0;

  for (const lot of allLots) {
    const qty = parseFloat(lot.quantity);
    const price = getPriceForDate(lot.tokenAddress, today);
    const rawValue = qty * price;
    const liq = tokenLiqMap.get(lot.tokenAddress);
    const value =
      liq !== null && liq !== undefined ? Math.min(rawValue, liq) : rawValue;
    const costBasis = qty * lot.avgCostUsd;
    totalValueUsd += value;
    totalCostBasisUsd += costBasis;
    unrealizedPnlUsd += value - costBasis;
    realizedPnlUsdCum += lot.realizedPnlUsd;
  }

  db.insert(dailySnapshots)
    .values({ date: today, totalValueUsd, totalCostBasisUsd, unrealizedPnlUsd, realizedPnlUsdCum })
    .onConflictDoUpdate({
      target: dailySnapshots.date,
      set: { totalValueUsd, totalCostBasisUsd, unrealizedPnlUsd, realizedPnlUsdCum },
    })
    .run();
}

export interface TokenPosition {
  contractAddress: string;
  symbol: string;
  decimals: number;
  isPriced: boolean;
  quantity: number;
  avgCostUsd: number;
  currentPriceUsd: number;
  liquidityUsd: number | null;
  valueUsd: number;
  costBasisUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  percentageOfPortfolio: number;
}

export function getCurrentPositions(today: string): {
  positions: TokenPosition[];
  totalValueUsd: number;
  totalRealizedUsd: number;
  totalUnrealizedUsd: number;
} {
  const allTokens = db.select().from(tokens).all();
  const allLots = db.select().from(lots).all();
  const lotMap = new Map(allLots.map((l) => [l.tokenAddress, l]));

  const positions: TokenPosition[] = [];
  let totalValueUsd = 0;
  let totalRealizedUsd = 0;

  for (const token of allTokens) {
    const lot = lotMap.get(token.contractAddress);
    if (!lot) continue;
    const qty = parseFloat(lot.quantity);
    if (qty <= 0 && lot.realizedPnlUsd === 0) continue;

    const currentPrice = token.isPriced
      ? getPriceForDate(token.contractAddress, today)
      : 0;
    const rawValueUsd = qty * currentPrice;
    const valueUsd =
      token.liquidityUsd !== null && token.liquidityUsd !== undefined
        ? Math.min(rawValueUsd, token.liquidityUsd)
        : rawValueUsd;
    const costBasisUsd = qty * lot.avgCostUsd;
    const unrealizedPnlUsd = valueUsd - costBasisUsd;

    positions.push({
      contractAddress: token.contractAddress,
      symbol: token.symbol || token.contractAddress.slice(0, 8),
      decimals: token.decimals,
      isPriced: token.isPriced,
      quantity: qty,
      avgCostUsd: lot.avgCostUsd,
      currentPriceUsd: currentPrice,
      liquidityUsd: token.liquidityUsd ?? null,
      valueUsd,
      costBasisUsd,
      unrealizedPnlUsd,
      realizedPnlUsd: lot.realizedPnlUsd,
      percentageOfPortfolio: 0, // computed after total is known
    });

    totalValueUsd += valueUsd;
    totalRealizedUsd += lot.realizedPnlUsd;
  }

  const totalUnrealizedUsd = positions.reduce(
    (s, p) => s + p.unrealizedPnlUsd,
    0
  );

  // Compute percentages
  for (const p of positions) {
    p.percentageOfPortfolio =
      totalValueUsd > 0 ? (p.valueUsd / totalValueUsd) * 100 : 0;
  }

  return { positions, totalValueUsd, totalRealizedUsd, totalUnrealizedUsd };
}
