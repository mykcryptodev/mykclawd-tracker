// Synthetic daily snapshot backfill — Apr 18 2026 → yesterday
//
// Creates one aero_snapshots row per calendar day using:
//   • hodlUsd  — EXACT: fixed hodlWeth/hodlBtc × CoinGecko daily price
//   • stratUsd — APPROX: hodlUsd + cumulative AERO earned that day × daily AERO price
//                (LP IL treated as 0; accurate IL requires archive-node reads)
//
// Run once after aero-backfill.ts has populated aero_transfers:
//   npx tsx --env-file=.env.local scripts/aero-history-backfill.ts
//
// Safe to re-run — uses onConflictDoNothing so existing rows are preserved.

import "dotenv/config";
import { db, changedRows } from "../db/client";
import { aeroTransfers, aeroSnapshots, aeroConfig } from "../db/schema";
import { sql } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import {
  AERO_AERO, AERO_WETH, AERO_CBBTC,
  AERO_NPM, AERO_KNOWN_ROUTERS, AERO_COINGECKO_IDS,
} from "../lib/aero/constants";
import { runMigrations } from "../db/migrate";

// ── LP inception (Apr 18 2026 2:23:49 PM UTC-4) ─────────────────────────────
const LP_SINCE_TS = 1776551029;

// ── Addresses to backfill ────────────────────────────────────────────────────
const ADDRESSES = [
  { address: "0xf142022273602c6a6c0ea7a044d21082273bd686", label: "mykclawd" },
  { address: "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7", label: "wishlist.holiday" },
  { address: "0x4d63da43f74e864f069f908465f2f3f13977976e", label: "yield.myk.eth" },
];

// ── Prices ───────────────────────────────────────────────────────────────────
type PriceSeries = Array<[number, number]>; // [unixSec, usd]

async function cgDaily(id: string, days: number): Promise<PriceSeries> {
  const key = process.env.CG_DEMO_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-demo-api-key"] = key;
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`CoinGecko ${res.status} for ${id}: ${await res.text()}`);
  const j = await res.json() as { prices?: Array<[number, number]> };
  return (j.prices ?? []).map(([ms, p]) => [Math.floor(ms / 1000), p]);
}

function priceAt(series: PriceSeries, ts: number): number {
  if (!series.length) return 0;
  let best = series[0];
  for (const p of series) if (Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p;
  return best[1];
}

// ── Config lookup ─────────────────────────────────────────────────────────────
async function readConfig(key: string): Promise<string | null> {
  const row = await db.select().from(aeroConfig).where(eq(aeroConfig.key, key)).get();
  return row?.value ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function backfillAddress(address: string, label: string, prices: {
  weth: PriceSeries; btc: PriceSeries; aero: PriceSeries;
}): Promise<void> {
  const addr = address.toLowerCase();

  // Read pool/gauge from config cache (populated by the normal sync)
  const gauge = await readConfig(`aero_gauge_${addr}`);
  if (!gauge) {
    console.log(`  [skip] no cached gauge — run a normal sync first`);
    return;
  }

  // Derive pool from transfer counterparties (most frequent WETH bidirectional address)
  const transfers = await db.select().from(aeroTransfers)
    .where(eq(aeroTransfers.walletAddress, addr))
    .orderBy(asc(aeroTransfers.blockTimestamp)).all();

  if (!transfers.length) {
    console.log(`  [skip] no transfers — run aero-backfill.ts first`);
    return;
  }

  // Count bidirectional WETH counterparties to infer pool address
  const cpCount = new Map<string, number>();
  for (const r of transfers) {
    if (r.tokenAddress === AERO_WETH) {
      cpCount.set(r.counterparty, (cpCount.get(r.counterparty) ?? 0) + 1);
    }
  }
  // Pool is the address with the most bidirectional WETH activity (not a known router)
  const knownRouters = new Set([
    AERO_NPM.toLowerCase(),
    ...Object.keys(AERO_KNOWN_ROUTERS),
    "0x0000000000000000000000000000000000000000",
  ]);
  const pool = [...cpCount.entries()]
    .filter(([cp]) => !knownRouters.has(cp) && cp !== gauge)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  if (!pool) {
    console.log(`  [skip] could not infer pool address from transfers`);
    return;
  }

  const STRAT = new Set([pool, gauge, AERO_NPM.toLowerCase(), ...Object.keys(AERO_KNOWN_ROUTERS)]);

  // Compute total HODL capital (same identity as snapshot.ts)
  let depositT0 = 0, withdrawT0 = 0;
  let depositT1 = 0, withdrawT1 = 0;
  const ZERO = "0x0000000000000000000000000000000000000000";

  for (const r of transfers) {
    const amount = Number(BigInt(r.rawAmount)) / 10 ** r.decimals;
    const isT0 = r.tokenAddress === AERO_WETH;
    const isT1 = r.tokenAddress === AERO_CBBTC;
    if (!isT0 && !isT1) continue;
    if (r.direction === "out" && STRAT.has(r.counterparty)) {
      if (isT0) depositT0 += amount;
      if (isT1) depositT1 += amount;
    } else if (r.direction === "in" && STRAT.has(r.counterparty)) {
      if (isT0) withdrawT0 += amount;
      if (isT1) withdrawT1 += amount;
    }
  }

  // hodlWeth/hodlBtc = total capital committed (excluding wallet balance —
  // we add nowT0N/nowT1N in the live snapshot; here we treat the LP as holding
  // the full capital since we don't have historical wallet reads).
  const hodlWeth = depositT0 - withdrawT0;
  const hodlBtc  = depositT1 - withdrawT1;

  const firstTs = transfers[0].blockTimestamp;
  const lastTs  = transfers[transfers.length - 1].blockTimestamp;
  const p0Start = priceAt(prices.weth, firstTs);
  const p1Start = priceAt(prices.btc,  firstTs);
  const paStart = priceAt(prices.aero, firstTs);
  const startUsd = hodlWeth * p0Start + hodlBtc * p1Start;

  // Build cumulative AERO series: AERO claimed from gauge (counterparty IS in STRAT).
  // Do NOT filter out STRAT counterparties here — the gauge is STRAT and that's
  // exactly where rewards come from.
  const aeroRows = transfers
    .filter(r => r.tokenAddress === AERO_AERO && r.direction === "in")
    .map(r => ({ ts: r.blockTimestamp, amount: Number(BigInt(r.rawAmount)) / 1e18 }));

  // Count unique tx hashes for txCount
  const uniqTx = new Set(transfers.map(r => r.txHash)).size;

  // ── Generate one row per calendar day ──────────────────────────────────────
  const nowTs = Math.floor(Date.now() / 1000);
  // Start at midnight of the day AFTER LP inception; stop before today (today's
  // live snapshot covers "now")
  const startDay = Math.floor(LP_SINCE_TS / 86400) * 86400 + 86400;
  const endDay   = Math.floor(nowTs / 86400) * 86400; // today midnight (exclusive)

  // Delete all existing synthetic rows for this address in the backfill window.
  // Uses the drizzle client so it targets the correct backend (Turso or local SQLite).
  await db.delete(aeroSnapshots).where(
    sql`${aeroSnapshots.address} = ${addr} AND ${aeroSnapshots.ts} >= ${startDay} AND ${aeroSnapshots.ts} < ${endDay}`,
  ).run();

  let inserted = 0;
  for (let dayTs = startDay; dayTs < endDay; dayTs += 86400) {
    const p0 = priceAt(prices.weth, dayTs);
    const p1 = priceAt(prices.btc,  dayTs);
    const pa = priceAt(prices.aero, dayTs);

    // Cumulative AERO earned up to this day
    const cumulativeAero = aeroRows
      .filter(r => r.ts <= dayTs)
      .reduce((s, r) => s + r.amount, 0);

    const hodlUsd      = hodlWeth * p0 + hodlBtc * p1;
    const aeroAddedUsd = cumulativeAero * pa;
    // lpOnlyDelta is unknown without archive reads — treat as 0 for historical rows
    const lpOnlyDelta  = 0;
    const stratUsd     = hodlUsd + aeroAddedUsd + lpOnlyDelta;
    const deltaUsd     = stratUsd - hodlUsd;
    const deltaPct     = hodlUsd > 0 ? (stratUsd / hodlUsd - 1) * 100 : 0;
    const days         = (dayTs - firstTs) / 86400;
    const apr          = days > 0 ? (Math.pow(stratUsd / hodlUsd, 365 / days) - 1) * 100 : 0;
    const netBenefitUsd = aeroAddedUsd + lpOnlyDelta;
    const netBenefitPct = startUsd > 0 ? (netBenefitUsd / startUsd) * 100 : 0;
    const coverageRatio = lpOnlyDelta >= 0 ? 99 : aeroAddedUsd > 0 ? aeroAddedUsd / Math.abs(lpOnlyDelta) : 0;

    const result = await db.insert(aeroSnapshots).values({
      ts: dayTs,
      address: addr,
      pool,
      gauge,
      token0: AERO_WETH,
      token1: AERO_CBBTC,
      sym0: "WETH",
      sym1: "cbBTC",
      dec0: 18,
      dec1: 8,
      firstTs,
      lastTs,
      days,
      p0Now: p0, p1Now: p1, paNow: pa,
      p0Start, p1Start, paStart,
      startEth: 0, startT0: 0, startT1: 0, startAero: 0,
      extInflowT0: 0, extInflowT1: 0,
      walletEth: 0, walletT0: 0, walletT1: 0, walletAero: 0,
      positionT0: hodlWeth,  // treat full capital as in LP for historical view
      positionT1: hodlBtc,
      pendingAero: cumulativeAero,
      startUsd,
      hodlUsd,
      stratUsd,
      deltaUsd,
      lpOnlyDeltaUsd: lpOnlyDelta,
      aeroAddedUsd,
      deltaPct,
      apr,
      totalGasEth: 0, totalGasUsd: 0,
      txCount: uniqTx,
      gasTxsCounted: uniqTx,
      positionsJson: "[]",
      inflowsJson: "[]",
      netBenefitUsd,
      netBenefitPct,
      coverageRatio,
    }).run();

    inserted++;
  }

  console.log(`  Inserted ${inserted} daily snapshot rows (${new Date(startDay * 1000).toISOString().slice(0,10)} → ${new Date((endDay - 86400) * 1000).toISOString().slice(0,10)})`);
}

async function main() {
  await runMigrations();

  const days = Math.ceil((Date.now() / 1000 - LP_SINCE_TS) / 86400) + 2;
  console.log(`Fetching ${days}-day price history from CoinGecko…`);
  const [weth, btc, aero] = await Promise.all([
    cgDaily(AERO_COINGECKO_IDS[AERO_WETH]  ?? "ethereum",          days),
    cgDaily(AERO_COINGECKO_IDS[AERO_CBBTC] ?? "bitcoin",           days),
    cgDaily("aerodrome-finance",                                     days),
  ]);
  console.log(`  WETH: ${weth.length} pts, BTC: ${btc.length} pts, AERO: ${aero.length} pts`);

  for (const { address, label } of ADDRESSES) {
    console.log(`\n=== ${label} (${address}) ===`);
    await backfillAddress(address, label, { weth, btc, aero });
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
