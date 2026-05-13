import { db } from "../../db/client";
import {
  transfers,
  transactions,
  tokens,
  lots,
  prices,
  dailySnapshots,
  syncState,
} from "../../db/schema";
import { getPriceForDate } from "../ingest/prices";
import { processInbound, processOutbound, processGas, type Lot } from "./wavg";
import { NATIVE_TOKEN_ADDRESS } from "../rpc";
import { and, asc, eq, gt, inArray } from "drizzle-orm";

/** Omitted from PnL dashboard positions, totals, and allocation (case-insensitive). */
const PNL_DASHBOARD_EXCLUDED_CONTRACTS = new Set(
  ["0xe3c5fcfbfea42d5ce2492fd82c239b5503f17ba3"].map((a) => a.toLowerCase())
);

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

const PNL_SYNC_KEY = "pnl_last_processed_block";

type TransferRow = typeof transfers.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type TokenMeta = Map<string, { decimals: number; isPriced: boolean; symbol: string }>;

type ReplayEvent =
  | {
      kind: "transfer";
      blockTimestamp: number;
      blockNumber: number;
      sortIndex: number;
      transfer: TransferRow;
    }
  | {
      kind: "gas";
      blockTimestamp: number;
      blockNumber: number;
      sortIndex: number;
      tx: TransactionRow;
    };

export interface IncrementalPnlResult {
  eventsProcessed: number;
  snapshotsWritten: number;
  fullReplay: boolean;
  initializedCursor: boolean;
}

async function loadTokenMeta(): Promise<TokenMeta> {
  const allTokens = await db.select().from(tokens).all();
  return new Map(
    allTokens.map((t) => [
      t.contractAddress,
      { decimals: t.decimals, isPriced: t.isPriced, symbol: t.symbol },
    ])
  );
}

function sortReplayEvents(events: ReplayEvent[]): ReplayEvent[] {
  return events.sort((a, b) =>
    a.blockTimestamp - b.blockTimestamp ||
    a.blockNumber - b.blockNumber ||
    a.sortIndex - b.sortIndex
  );
}

async function loadReplayEvents(afterBlock?: number): Promise<ReplayEvent[]> {
  const allTransfers = afterBlock === undefined
    ? await db.select().from(transfers).all()
    : await db.select().from(transfers).where(gt(transfers.blockNumber, afterBlock)).all();
  const gasTxList = (afterBlock === undefined
    ? await db.select().from(transactions).all()
    : await db.select().from(transactions).where(gt(transactions.blockNumber, afterBlock)).all())
    .filter((t) => t.gasEthWei !== "0");

  return sortReplayEvents([
    ...allTransfers.map((transfer) => ({
      kind: "transfer" as const,
      blockTimestamp: transfer.blockTimestamp,
      blockNumber: transfer.blockNumber,
      sortIndex: transfer.logIndex,
      transfer,
    })),
    ...gasTxList.map((tx) => ({
      kind: "gas" as const,
      blockTimestamp: tx.blockTimestamp,
      blockNumber: tx.blockNumber,
      sortIndex: Number.MAX_SAFE_INTEGER,
      tx,
    })),
  ]);
}

async function readPnlLastProcessedBlock(): Promise<number | null> {
  const row = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, PNL_SYNC_KEY))
    .get();
  return row ? Number(row.value) : null;
}

async function writePnlLastProcessedBlock(blockNumber: number): Promise<void> {
  await db.insert(syncState)
    .values({ key: PNL_SYNC_KEY, value: blockNumber.toString() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value: blockNumber.toString() },
    })
    .run();
}

async function readMaxPortfolioBlock(): Promise<number> {
  const transferBlocks = await db
    .select({ blockNumber: transfers.blockNumber })
    .from(transfers)
    .all();
  const txBlocks = await db
    .select({ blockNumber: transactions.blockNumber })
    .from(transactions)
    .all();

  return Math.max(0, ...transferBlocks.map((r) => r.blockNumber), ...txBlocks.map((r) => r.blockNumber));
}

function loadLotStateFromRows(rows: Array<typeof lots.$inferSelect>): Map<string, Lot> {
  return new Map(
    rows.map((lot) => [
      lot.tokenAddress,
      {
        quantity: parseFloat(lot.quantity),
        avgCostUsd: lot.avgCostUsd,
        realizedPnlUsd: lot.realizedPnlUsd,
      },
    ])
  );
}

function getLot(lotState: Map<string, Lot>, address: string): Lot {
  return lotState.get(address) ?? { quantity: 0, avgCostUsd: 0, realizedPnlUsd: 0 };
}

async function applyReplayEvent(
  event: ReplayEvent,
  tokenMeta: TokenMeta,
  lotState: Map<string, Lot>
): Promise<boolean> {
  const date = tsToDate(event.blockTimestamp);

  if (event.kind === "transfer") {
    const tokenAddr = event.transfer.tokenAddress ?? NATIVE_TOKEN_ADDRESS;
    const meta = tokenMeta.get(tokenAddr);
    if (!meta?.isPriced) return false;

    const amount = humanAmount(event.transfer.rawAmount, meta.decimals);
    const priceUsd = await getPriceForDate(tokenAddr, date);
    if (priceUsd === 0) return false;

    const lot = getLot(lotState, tokenAddr);
    const { lot: newLot } = event.transfer.direction === "in"
      ? processInbound(lot, amount, priceUsd)
      : processOutbound(lot, amount, priceUsd);
    lotState.set(tokenAddr, newLot);
    return true;
  }

  const ethMeta = tokenMeta.get(NATIVE_TOKEN_ADDRESS);
  if (!ethMeta?.isPriced) return false;

  const ethAmount = humanAmount(event.tx.gasEthWei, 18);
  const ethPrice = await getPriceForDate(NATIVE_TOKEN_ADDRESS, date);
  if (ethPrice === 0 || ethAmount === 0) return false;

  const lot = getLot(lotState, NATIVE_TOKEN_ADDRESS);
  const { lot: newLot } = processGas(lot, ethAmount, ethPrice);
  lotState.set(NATIVE_TOKEN_ADDRESS, newLot);
  return true;
}

async function persistLots(lotState: Map<string, Lot>): Promise<number> {
  const lotEntries = [...lotState.entries()];
  console.log(`\n  Persisting ${lotEntries.length} token lots...`);
  let lotsWritten = 0;

  for (const [tokenAddress, lot] of lotEntries) {
    await db.insert(lots)
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
    lotsWritten++;
    if (lotsWritten % 10 === 0 || lotsWritten === lotEntries.length) {
      console.log(`  ${lotsWritten}/${lotEntries.length} lots persisted`);
    }
  }

  return lotsWritten;
}

async function writeDailySnapshot(date: string, dayLots: Map<string, Lot>): Promise<void> {
  let totalValueUsd = 0;
  let totalCostBasisUsd = 0;
  let unrealizedPnlUsd = 0;
  let realizedPnlUsdCum = 0;

  for (const [tokenAddress, lot] of dayLots.entries()) {
    const priceUsd = await getPriceForDate(tokenAddress, date);
    const value = lot.quantity * priceUsd;
    const costBasis = lot.quantity * lot.avgCostUsd;

    totalValueUsd += value;
    totalCostBasisUsd += costBasis;
    unrealizedPnlUsd += value - costBasis;
    realizedPnlUsdCum += lot.realizedPnlUsd;
  }

  await db.insert(dailySnapshots)
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

  process.stdout.write(` $${totalValueUsd.toFixed(0)}\n`);
}

export async function computePnl(): Promise<void> {
  const tokenMeta = await loadTokenMeta();
  const replayEvents = await loadReplayEvents();
  const lotState = new Map<string, Lot>();

  // Collect day-end state for snapshots
  const dailyLots = new Map<string, Map<string, Lot>>(); // date → tokenAddress → lot

  const totalEvents = replayEvents.length;
  let processed = 0;

  for (const event of replayEvents) {
    processed++;
    if (processed % 500 === 0 || processed === totalEvents) {
      console.log(`  ${processed}/${totalEvents} portfolio events replayed`);
    }
    const date = tsToDate(event.blockTimestamp);

    const applied = await applyReplayEvent(event, tokenMeta, lotState);
    if (!applied) continue;

    // Snapshot daily state
    dailyLots.set(date, new Map(lotState));
  }

  await persistLots(lotState);

  // Compute and persist daily snapshots
  const today = new Date().toISOString().slice(0, 10);
  const snapshotDates = [...dailyLots.entries()].filter(([date]) => date <= today);
  console.log(`\n  Computing ${snapshotDates.length} daily snapshots...`);
  let snapshotsWritten = 0;
  for (const [date, dayLots] of snapshotDates) {
    const tokenCount = dayLots.size;
    process.stdout.write(`  [${snapshotsWritten + 1}/${snapshotDates.length}] ${date} — ${tokenCount} tokens...`);
    await writeDailySnapshot(date, dayLots);
    snapshotsWritten++;
  }

  await writePnlLastProcessedBlock(await readMaxPortfolioBlock());
  console.log(`\n  Done.`);
}

export async function initializePnlCursorFromCurrentState(): Promise<boolean> {
  const lastProcessedBlock = await readPnlLastProcessedBlock();
  if (lastProcessedBlock !== null) return false;

  const existingLots = await db.select().from(lots).all();
  const existingSnapshots = await db
    .select({ date: dailySnapshots.date })
    .from(dailySnapshots)
    .all();

  if (existingLots.length === 0 && existingSnapshots.length === 0) return false;

  const maxBlock = await readMaxPortfolioBlock();
  await writePnlLastProcessedBlock(maxBlock);
  console.log(`  Initialized PnL cursor at block ${maxBlock.toLocaleString()} from existing lots/snapshots`);
  return true;
}

export async function computePnlIncremental(): Promise<IncrementalPnlResult> {
  const lastProcessedBlock = await readPnlLastProcessedBlock();
  const maxBlock = await readMaxPortfolioBlock();

  if (lastProcessedBlock === null) {
    const initializedCursor = await initializePnlCursorFromCurrentState();
    if (initializedCursor) {
      return {
        eventsProcessed: 0,
        snapshotsWritten: 0,
        fullReplay: false,
        initializedCursor: true,
      };
    }

    await computePnl();
    return {
      eventsProcessed: 0,
      snapshotsWritten: 0,
      fullReplay: true,
      initializedCursor: false,
    };
  }

  if (lastProcessedBlock >= maxBlock) {
    return {
      eventsProcessed: 0,
      snapshotsWritten: 0,
      fullReplay: false,
      initializedCursor: false,
    };
  }

  const tokenMeta = await loadTokenMeta();
  const replayEvents = await loadReplayEvents(lastProcessedBlock);
  const lotState = loadLotStateFromRows(await db.select().from(lots).all());
  const dailyLots = new Map<string, Map<string, Lot>>();

  let appliedEvents = 0;
  for (const event of replayEvents) {
    if (appliedEvents % 100 === 0 && appliedEvents > 0) {
      console.log(`  ${appliedEvents}/${replayEvents.length} incremental portfolio events applied`);
    }

    const applied = await applyReplayEvent(event, tokenMeta, lotState);
    if (!applied) continue;

    appliedEvents++;
    dailyLots.set(tsToDate(event.blockTimestamp), new Map(lotState));
  }

  await persistLots(lotState);

  const today = new Date().toISOString().slice(0, 10);
  const snapshotDates = [...dailyLots.entries()].filter(([date]) => date <= today);
  let snapshotsWritten = 0;
  for (const [date, dayLots] of snapshotDates) {
    process.stdout.write(`  [incremental ${snapshotsWritten + 1}/${snapshotDates.length}] ${date} — ${dayLots.size} tokens...`);
    await writeDailySnapshot(date, dayLots);
    snapshotsWritten++;
  }

  await writePnlLastProcessedBlock(maxBlock);

  return {
    eventsProcessed: appliedEvents,
    snapshotsWritten,
    fullReplay: false,
    initializedCursor: false,
  };
}

// Recompute today's daily snapshot from the current lots table.
// Call this after any lot quantity overrides (e.g. ETH balance correction).
export async function recomputeTodaySnapshot(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const allLots = await db.select().from(lots).all();
  const tokenLiqMap = new Map(
    (await db.select({ contractAddress: tokens.contractAddress, liquidityUsd: tokens.liquidityUsd })
      .from(tokens)
      .all())
      .map((t) => [t.contractAddress, t.liquidityUsd])
  );

  let totalValueUsd = 0;
  let totalCostBasisUsd = 0;
  let unrealizedPnlUsd = 0;
  let realizedPnlUsdCum = 0;

  for (const lot of allLots) {
    const qty = parseFloat(lot.quantity);
    const price = await getPriceForDate(lot.tokenAddress, today);
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

  await db.insert(dailySnapshots)
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
  imageUrl: string | null;
  imageChecked: boolean;
}

export async function getDailySnapshotSeries(): Promise<Array<typeof dailySnapshots.$inferSelect>> {
  return db.select().from(dailySnapshots).orderBy(asc(dailySnapshots.date)).all();
}

async function loadPricesForDate(
  tokenAddresses: string[],
  date: string
): Promise<Map<string, number>> {
  if (tokenAddresses.length === 0) return new Map();

  const rows = await db
    .select({ tokenAddress: prices.tokenAddress, priceUsd: prices.priceUsd })
    .from(prices)
    .where(and(eq(prices.date, date), inArray(prices.tokenAddress, tokenAddresses)))
    .all();

  return new Map(rows.map((row) => [row.tokenAddress, row.priceUsd]));
}

export async function getCurrentPositions(today: string): Promise<{
  positions: TokenPosition[];
  totalValueUsd: number;
  totalRealizedUsd: number;
  totalUnrealizedUsd: number;
}> {
  const allLots = await db.select().from(lots).all();
  const displayLots = allLots.filter((lot) => {
    const qty = parseFloat(lot.quantity);
    return qty > 0 || lot.realizedPnlUsd !== 0;
  });

  if (displayLots.length === 0) {
    return {
      positions: [],
      totalValueUsd: 0,
      totalRealizedUsd: 0,
      totalUnrealizedUsd: 0,
    };
  }

  const lotMap = new Map(displayLots.map((lot) => [lot.tokenAddress, lot]));
  const tokenAddresses = displayLots.map((lot) => lot.tokenAddress);
  const allTokens = await db
    .select()
    .from(tokens)
    .where(inArray(tokens.contractAddress, tokenAddresses))
    .all();
  const priceMap = await loadPricesForDate(
    allTokens
      .filter((token) => token.isPriced)
      .map((token) => token.contractAddress),
    today
  );

  const positions: TokenPosition[] = [];
  let totalValueUsd = 0;
  let totalRealizedUsd = 0;

  for (const token of allTokens) {
    if (PNL_DASHBOARD_EXCLUDED_CONTRACTS.has(token.contractAddress.toLowerCase())) {
      continue;
    }
    const lot = lotMap.get(token.contractAddress);
    if (!lot) continue;
    const qty = parseFloat(lot.quantity);
    if (qty <= 0 && lot.realizedPnlUsd === 0) continue;

    const currentPrice = token.isPriced
      ? priceMap.get(token.contractAddress) ?? 0
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
      percentageOfPortfolio: 0,
      imageUrl: token.imageUrl ?? null,
      imageChecked: token.imageChecked,
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
