// Compute a full snapshot of strategy state from cached transfers + live on-chain reads.

import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { db } from "../../db/client";
import { aeroTransfers, aeroSnapshots } from "../../db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { AERO_AERO, AERO_NPM, AERO_COINGECKO_IDS, AERO_KNOWN_ROUTERS } from "./constants";
import { DiscoveredPosition } from "./discover";
import { ingestAeroGas } from "./gas";

const rpc = createPublicClient({
  chain: base,
  transport: http(process.env.COINBASE_RPC_URL ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const npmAbi = parseAbi([
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);
const gaugeAbi = parseAbi([
  "function earned(address account, uint256 tokenId) view returns (uint256)",
  "function stakedValues(address depositor) view returns (uint256[])",
]);
const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
]);

// ───── price helpers ─────
type PriceSeries = Array<[number, number]>;

async function coingeckoSeries(id: string, days: number): Promise<{ now: number; series: PriceSeries }> {
  const key = process.env.CG_DEMO_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-demo-api-key"] = key;
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=hourly`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { now: 0, series: [] };
  const j = (await res.json()) as { prices?: Array<[number, number]> };
  const series: PriceSeries = (j.prices ?? []).map(([ms, p]) => [Math.floor(ms / 1000), p]);
  return { now: series[series.length - 1]?.[1] ?? 0, series };
}

function priceAt(series: PriceSeries, ts: number): number {
  if (!series.length) return 0;
  let best = series[0];
  for (const p of series) if (Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p;
  return best[1];
}

// ───── concentrated-liquidity math (Uniswap V3) ─────
function tickToSqrt(t: number): bigint {
  return BigInt(Math.floor(Math.pow(1.0001, t / 2) * 2 ** 96));
}
function liqToAmounts(L: bigint, sqrtP: bigint, sqrtL: bigint, sqrtU: bigint): [bigint, bigint] {
  const Q96 = 2n ** 96n;
  if (sqrtP <= sqrtL) return [(L * Q96 * (sqrtU - sqrtL)) / (sqrtU * sqrtL), 0n];
  if (sqrtP >= sqrtU) return [0n, (L * (sqrtU - sqrtL)) / Q96];
  return [(L * Q96 * (sqrtU - sqrtP)) / (sqrtU * sqrtP), (L * (sqrtP - sqrtL)) / Q96];
}

// ───── chain reads ─────
async function balanceAt(token: string, addr: string, block: bigint): Promise<bigint> {
  return (await rpc.readContract({
    address: token as `0x${string}`, abi: erc20Abi, functionName: "balanceOf",
    args: [addr as `0x${string}`], blockNumber: block,
  })) as bigint;
}
async function ethAt(addr: string, block: bigint): Promise<bigint> {
  return await rpc.getBalance({ address: addr as `0x${string}`, blockNumber: block });
}

// ───── main snapshot ─────

export interface AeroSnapshot {
  ts: number;
  address: string;
  pool: string;
  gauge: string;
  token0: string;
  token1: string;
  sym0: string;
  sym1: string;
  dec0: number;
  dec1: number;
  firstTs: number;
  lastTs: number;
  days: number;
  prices: { p0Now: number; p1Now: number; paNow: number; p0Start: number; p1Start: number; paStart: number };
  start: { eth: number; t0: number; t1: number; aero: number };
  inflows: { t0: number; t1: number; list: Array<{ ts: number; sym: string; amount: number; from: string; tx: string }> };
  end: { walletEth: number; walletT0: number; walletT1: number; walletAero: number; positionT0: number; positionT1: number; pendingAero: number };
  usd: { startUsd: number; hodlUsd: number; stratUsd: number; deltaUsd: number; lpOnlyDelta: number; aeroAddedUsd: number; deltaPct: number; apr: number; totalGasEth: number; totalGasUsd: number };
  health: {
    netBenefitUsd: number;
    netBenefitPct: number;
    coverageRatio: number;
    aeroVelocityPerHr: number | null;
    lpDeltaVelocityPerHr: number | null;
  };
  txCount: number;
  gasTxsCounted: number;
  positions: Array<{ tokenId: string; tickLower: number; tickUpper: number; curTick: number; liquidity: string; a0: string; a1: string; earned: string }>;
}

export async function computeAeroSnapshot(pos: DiscoveredPosition, daysBack: number): Promise<AeroSnapshot> {
  // Pull cached transfers — use full history so HODL baseline is anchored at the
  // actual first deposit, not the start of a rolling window. At the start of a
  // rolling window the capital is already deployed in the LP and the wallet
  // balance is near $0, producing a wildly understated HODL baseline.
  const allRows = await db.select().from(aeroTransfers)
    .where(eq(aeroTransfers.walletAddress, pos.address.toLowerCase()))
    .orderBy(asc(aeroTransfers.blockTimestamp)).all();
  if (allRows.length === 0) throw new Error("No cached aero_transfers — run sync first.");

  const firstTs = allRows[0].blockTimestamp;
  const lastTs  = allRows[allRows.length - 1].blockTimestamp;
  const firstBlock = BigInt(allRows[0].blockNumber);

  // Prices — cover the full position duration so p0Start/p1Start are accurate.
  const actualDays = Math.ceil((Date.now() / 1000 - firstTs) / 86400) + 3;
  const cgDays = Math.min(365, Math.max(actualDays, 14));
  const [p0, p1, pA] = await Promise.all([
    coingeckoSeries(AERO_COINGECKO_IDS[pos.token0] ?? "ethereum", cgDays),
    coingeckoSeries(AERO_COINGECKO_IDS[pos.token1] ?? "bitcoin", cgDays),
    coingeckoSeries("aerodrome-finance", cgDays),
  ]);
  const p0Now = p0.now, p1Now = p1.now, paNow = pA.now;
  const p0Start = priceAt(p0.series, firstTs);
  const p1Start = priceAt(p1.series, firstTs);
  const paStart = priceAt(pA.series, firstTs);

  // Starting balances (block before first event)
  const before = firstBlock > 1n ? firstBlock - 1n : firstBlock;
  const [startEth, startT0, startT1, startAero] = await Promise.all([
    ethAt(pos.address, before),
    balanceAt(pos.token0, pos.address, before),
    balanceAt(pos.token1, pos.address, before),
    balanceAt(AERO_AERO, pos.address, before),
  ]);

  // HODL baseline via net LP flows — more robust than wallet-balance-at-start.
  //
  // Insight: HODL_T0 = (T0 deposited into LP) − (T0 received from LP) + (T0 in wallet now)
  //
  // This identity holds because every fee round-trip and rebalance round-trip cancels:
  //   collect 0.1 WETH fee → withdrawT0 += 0.1, nowT0N += 0.1  → net 0
  //   rebalance (withdraw 5 then re-deposit 5) → ±5 cancel       → net 0
  //
  // Only genuine initial/additional deposits remain, regardless of how many times the
  // position was rebalanced or fees were collected, and regardless of which specific block
  // the LP was first created (no archive read of historical LP position needed).
  //
  // STRAT = all LP-ecosystem contracts whose transfers are NOT external capital events.
  // NPM must be included so fee collections routed through it cancel correctly.
  const ZERO = "0x0000000000000000000000000000000000000000";
  const STRAT = new Set([
    pos.pool, pos.gauge,
    AERO_NPM.toLowerCase(),
    ...Object.keys(AERO_KNOWN_ROUTERS),
  ]);

  let depositT0 = 0, depositT1 = 0;  // T0/T1 sent INTO the LP ecosystem
  let withdrawT0 = 0, withdrawT1 = 0; // T0/T1 received BACK from the LP ecosystem
  let extT0 = 0, extT1 = 0;          // external capital additions (for display)
  const inflowList: Array<{ ts: number; sym: string; amount: number; from: string; tx: string }> = [];

  for (const r of allRows) {
    const amount = Number(BigInt(r.rawAmount)) / 10 ** r.decimals;
    const isT0 = r.tokenAddress === pos.token0;
    const isT1 = r.tokenAddress === pos.token1;
    if (!isT0 && !isT1) {
      // AERO rewards — not part of T0/T1 HODL comparison; track external for display
      if (r.direction === "in" && !STRAT.has(r.counterparty) && r.counterparty !== ZERO)
        inflowList.push({ ts: r.blockTimestamp, sym: r.symbol, amount, from: r.counterparty, tx: r.txHash });
      continue;
    }
    if (r.direction === "out" && STRAT.has(r.counterparty)) {
      if (isT0) depositT0 += amount;
      if (isT1) depositT1 += amount;
    } else if (r.direction === "in" && STRAT.has(r.counterparty)) {
      if (isT0) withdrawT0 += amount;
      if (isT1) withdrawT1 += amount;
    } else if (r.direction === "in" && !STRAT.has(r.counterparty) && r.counterparty !== ZERO) {
      // External inflow — could be user's own wallet topping up; display it.
      // It's already captured in nowT0N/nowT1N (if still in wallet) or in depositT0/depositT1
      // (if subsequently deposited into LP), so no separate term needed in the formula.
      if (isT0) extT0 += amount;
      if (isT1) extT1 += amount;
      inflowList.push({ ts: r.blockTimestamp, sym: r.symbol, amount, from: r.counterparty, tx: r.txHash });
    }
  }

  // Current state
  const head = await rpc.getBlockNumber();
  const [nowEth, nowT0, nowT1, nowAero] = await Promise.all([
    ethAt(pos.address, head),
    balanceAt(pos.token0, pos.address, head),
    balanceAt(pos.token1, pos.address, head),
    balanceAt(AERO_AERO, pos.address, head),
  ]);
  const slot0 = await rpc.readContract({
    address: pos.pool as `0x${string}`, abi: poolAbi, functionName: "slot0",
  });
  const sqrtP = slot0[0];
  const curTick = Number(slot0[1]);

  let posT0 = 0n, posT1 = 0n, pendingAero = 0n;
  const positions: AeroSnapshot["positions"] = [];
  for (const tid of pos.stakedTokenIds) {
    const p = await rpc.readContract({
      address: AERO_NPM as `0x${string}`, abi: npmAbi, functionName: "positions", args: [tid],
    }) as readonly [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint];
    const earned = (await rpc.readContract({
      address: pos.gauge as `0x${string}`, abi: gaugeAbi, functionName: "earned",
      args: [pos.address as `0x${string}`, tid],
    })) as bigint;
    pendingAero += earned;
    const tickLower = Number(p[5]);
    const tickUpper = Number(p[6]);
    const liquidity = p[7];
    const owed0 = p[10];
    const owed1 = p[11];
    const [a0, a1] = liqToAmounts(liquidity, sqrtP, tickToSqrt(tickLower), tickToSqrt(tickUpper));
    const totA0 = a0 + owed0;
    const totA1 = a1 + owed1;
    posT0 += totA0;
    posT1 += totA1;
    positions.push({
      tokenId: tid.toString(),
      tickLower,
      tickUpper,
      curTick,
      liquidity: liquidity.toString(),
      a0: totA0.toString(),
      a1: totA1.toString(),
      earned: earned.toString(),
    });
  }

  // Gas cost (uses the cache)
  const uniqHashes = Array.from(new Set(allRows.map((r) => r.txHash)));
  const { totalGasWei } = await ingestAeroGas(uniqHashes);
  const totalGasEth = Number(totalGasWei) / 1e18;

  // Numerify all balances
  const num = (v: bigint, d: number) => Number(v) / 10 ** d;
  const startEthN = num(startEth, 18);
  const startT0N = num(startT0, pos.tokenMeta0.dec);
  const startT1N = num(startT1, pos.tokenMeta1.dec);
  const startAeroN = num(startAero, 18);
  const nowEthN = num(nowEth, 18);
  const nowT0N = num(nowT0, pos.tokenMeta0.dec);
  const nowT1N = num(nowT1, pos.tokenMeta1.dec);
  const nowAeroN = num(nowAero, 18);
  const posT0N = num(posT0, pos.tokenMeta0.dec);
  const posT1N = num(posT1, pos.tokenMeta1.dec);
  const pendingAeroN = num(pendingAero, 18);

  // HODL baseline: net LP deposits + current wallet (ETH for gas treated as T0-equivalent).
  // The identity HODL_T0 = depositT0 − withdrawT0 + nowT0N means fee/rebalance round-trips
  // cancel automatically; only net capital ever committed to the LP counts.
  const hodlEthEq = startEthN + (depositT0 - withdrawT0 + nowT0N);
  const hodlBtc   = depositT1 - withdrawT1 + nowT1N;
  const hodlAero  = startAeroN;
  const hodlUsd = hodlEthEq * p0Now + hodlBtc * p1Now + hodlAero * paNow;

  const totalAeroN = nowAeroN + pendingAeroN;
  const stratUsd =
    (nowEthN + nowT0N + posT0N) * p0Now +
    (nowT1N + posT1N) * p1Now +
    totalAeroN * paNow;

  // startUsd: USD value of the HODL amount at entry prices
  const startUsd = hodlEthEq * p0Start + hodlBtc * p1Start + hodlAero * paStart;
  const aeroAddedUsd = (totalAeroN - startAeroN) * paNow;
  const deltaUsd = stratUsd - hodlUsd;
  const lpOnlyDelta = deltaUsd - aeroAddedUsd;
  const deltaPct = (stratUsd / hodlUsd - 1) * 100;
  const days = (lastTs - firstTs) / 86400;
  const apr = days > 0 ? (Math.pow(stratUsd / hodlUsd, 365 / days) - 1) * 100 : 0;

  // ── Health / exit metrics ──
  const netBenefitUsd = aeroAddedUsd + lpOnlyDelta;
  const netBenefitPct = startUsd > 0 ? (netBenefitUsd / startUsd) * 100 : 0;
  const coverageRatio = lpOnlyDelta >= 0
    ? 99
    : aeroAddedUsd > 0
      ? aeroAddedUsd / Math.abs(lpOnlyDelta)
      : 0;

  const priorRow = await db.select().from(aeroSnapshots)
    .where(eq(aeroSnapshots.address, pos.address.toLowerCase()))
    .orderBy(desc(aeroSnapshots.ts))
    .limit(1)
    .get();

  let aeroVelocityPerHr: number | null = null;
  let lpDeltaVelocityPerHr: number | null = null;
  if (priorRow) {
    const nowTs = Math.floor(Date.now() / 1000);
    const dtHrs = (nowTs - priorRow.ts) / 3600;
    if (dtHrs > 0) {
      aeroVelocityPerHr = (aeroAddedUsd - priorRow.aeroAddedUsd) / dtHrs;
      lpDeltaVelocityPerHr = (lpOnlyDelta - priorRow.lpOnlyDeltaUsd) / dtHrs;
    }
  }

  return {
    ts: Math.floor(Date.now() / 1000),
    address: pos.address,
    pool: pos.pool,
    gauge: pos.gauge,
    token0: pos.token0,
    token1: pos.token1,
    sym0: pos.tokenMeta0.sym,
    sym1: pos.tokenMeta1.sym,
    dec0: pos.tokenMeta0.dec,
    dec1: pos.tokenMeta1.dec,
    firstTs, lastTs, days,
    prices: { p0Now, p1Now, paNow, p0Start, p1Start, paStart },
    start: { eth: startEthN, t0: startT0N, t1: startT1N, aero: startAeroN },
    inflows: { t0: extT0, t1: extT1, list: inflowList },
    end: {
      walletEth: nowEthN, walletT0: nowT0N, walletT1: nowT1N, walletAero: nowAeroN,
      positionT0: posT0N, positionT1: posT1N, pendingAero: pendingAeroN,
    },
    usd: {
      startUsd, hodlUsd, stratUsd, deltaUsd, lpOnlyDelta, aeroAddedUsd, deltaPct, apr,
      totalGasEth, totalGasUsd: totalGasEth * p0Now,
    },
    health: { netBenefitUsd, netBenefitPct, coverageRatio, aeroVelocityPerHr, lpDeltaVelocityPerHr },
    txCount: uniqHashes.length,
    gasTxsCounted: uniqHashes.length,
    positions,
  };
}

// Persist a snapshot row to aero_snapshots
export async function saveAeroSnapshot(s: AeroSnapshot): Promise<void> {
  await db.insert(aeroSnapshots).values({
    ts: s.ts,
    address: s.address,
    pool: s.pool,
    gauge: s.gauge,
    token0: s.token0,
    token1: s.token1,
    sym0: s.sym0,
    sym1: s.sym1,
    dec0: s.dec0,
    dec1: s.dec1,
    firstTs: s.firstTs,
    lastTs: s.lastTs,
    days: s.days,
    p0Now: s.prices.p0Now,
    p1Now: s.prices.p1Now,
    paNow: s.prices.paNow,
    p0Start: s.prices.p0Start,
    p1Start: s.prices.p1Start,
    paStart: s.prices.paStart,
    startEth: s.start.eth,
    startT0: s.start.t0,
    startT1: s.start.t1,
    startAero: s.start.aero,
    extInflowT0: s.inflows.t0,
    extInflowT1: s.inflows.t1,
    walletEth: s.end.walletEth,
    walletT0: s.end.walletT0,
    walletT1: s.end.walletT1,
    walletAero: s.end.walletAero,
    positionT0: s.end.positionT0,
    positionT1: s.end.positionT1,
    pendingAero: s.end.pendingAero,
    startUsd: s.usd.startUsd,
    hodlUsd: s.usd.hodlUsd,
    stratUsd: s.usd.stratUsd,
    deltaUsd: s.usd.deltaUsd,
    lpOnlyDeltaUsd: s.usd.lpOnlyDelta,
    aeroAddedUsd: s.usd.aeroAddedUsd,
    deltaPct: s.usd.deltaPct,
    apr: s.usd.apr,
    totalGasEth: s.usd.totalGasEth,
    totalGasUsd: s.usd.totalGasUsd,
    txCount: s.txCount,
    gasTxsCounted: s.gasTxsCounted,
    positionsJson: JSON.stringify(s.positions),
    inflowsJson: JSON.stringify(s.inflows.list),
    netBenefitUsd: s.health.netBenefitUsd,
    netBenefitPct: s.health.netBenefitPct,
    coverageRatio: s.health.coverageRatio,
    aeroVelocityPerHr: s.health.aeroVelocityPerHr ?? undefined,
    lpDeltaVelocityPerHr: s.health.lpDeltaVelocityPerHr ?? undefined,
  }).onConflictDoNothing().run();
}
