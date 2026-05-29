// Read layer for the portfolio page. Pure DB reads + period-change math derived
// from the cached Zapper data. Never calls Zapper (that only happens on sync).

import { db } from "../../db/client";
import { portfolioNav, portfolioPositions, portfolioSync } from "../../db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { NATIVE_ETH_ADDRESS } from "./zapper";

/** Zapper's CDN icon for native ETH on Base (same source as our other token logos). */
const ETH_IMG_URL =
  "https://storage.googleapis.com/zapper-fi-assets/tokens/base/0x0000000000000000000000000000000000000000.png";

export interface NavPoint {
  date: string; // YYYY-MM-DD (UTC)
  valueUsd: number;
}

export interface Delta {
  abs: number;
  pct: number;
}

export interface PortfolioPosition {
  tokenAddress: string;
  symbol: string;
  name: string;
  network: string;
  imgUrl: string | null;
  price: number | null;
  balance: number;
  balanceUsd: number;
  /** Share of total NAV, 0–100. */
  pctOfNav: number;
}

export interface PortfolioMeta {
  syncedAt: number; // unix seconds
  totalUsd: number; // NAV, excludes native ETH
  tokenCount: number;
  nativeEthBalance: number;
  nativeEthUsd: number;
}

export interface PortfolioOverview {
  meta: PortfolioMeta | null;
  /** Headline NAV — INCLUDES native ETH (= navExEthUsd + native ETH). */
  totalValueUsd: number;
  /** Ex-native-ETH total — the basis the chart series and deltas are computed on. */
  navExEthUsd: number;
  series: NavPoint[];
  /** All token holdings INCLUDING native ETH (pinned first by the table). */
  positions: PortfolioPosition[];
  deltas: {
    d1: Delta | null;
    d7: Delta | null;
    d30: Delta | null;
  };
}

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

/** YYYY-MM-DD for (UTC `from` - `n` days). `from` defaults to now. */
export function daysAgoUtc(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Most recent point on or before `targetDate` in an ascending-by-date series, or
 * null if every point is newer than the target.
 */
export function navAtOrBefore(series: NavPoint[], targetDate: string): NavPoint | null {
  let match: NavPoint | null = null;
  for (const p of series) {
    if (p.date <= targetDate) match = p;
    else break;
  }
  return match;
}

/** Change from the value ~`n` days ago to `currentTotal`. null if no usable baseline. */
export function deltaOverDays(
  series: NavPoint[],
  currentTotal: number,
  n: number,
  from: Date = new Date()
): Delta | null {
  const prev = navAtOrBefore(series, daysAgoUtc(n, from));
  if (!prev || prev.valueUsd === 0) return null;
  const abs = currentTotal - prev.valueUsd;
  return { abs, pct: (abs / prev.valueUsd) * 100 };
}

export function computeDeltas(
  series: NavPoint[],
  currentTotal: number,
  from: Date = new Date()
) {
  return {
    d1: deltaOverDays(series, currentTotal, 1, from),
    d7: deltaOverDays(series, currentTotal, 7, from),
    d30: deltaOverDays(series, currentTotal, 30, from),
  };
}

// ── DB reads ─────────────────────────────────────────────────────────────────

export interface NavSeriesRow extends NavPoint {
  source: "live" | "zapper_history";
}

export async function getNavSeries(): Promise<NavSeriesRow[]> {
  const rows = await db
    .select({
      date: portfolioNav.date,
      valueUsd: portfolioNav.valueUsd,
      source: portfolioNav.source,
    })
    .from(portfolioNav)
    .orderBy(asc(portfolioNav.date))
    .all();
  return rows;
}

export async function getPortfolioMeta(): Promise<PortfolioMeta | null> {
  const row = await db
    .select()
    .from(portfolioSync)
    .where(eq(portfolioSync.id, 1))
    .get();
  if (!row) return null;
  return {
    syncedAt: row.syncedAt,
    totalUsd: row.totalUsd,
    tokenCount: row.tokenCount,
    nativeEthBalance: row.nativeEthBalance,
    nativeEthUsd: row.nativeEthUsd,
  };
}

export async function getPositions(totalUsd: number): Promise<PortfolioPosition[]> {
  const rows = await db
    .select()
    .from(portfolioPositions)
    .orderBy(desc(portfolioPositions.balanceUsd))
    .all();
  return rows.map((r) => ({
    tokenAddress: r.tokenAddress,
    symbol: r.symbol,
    name: r.name,
    network: r.network,
    imgUrl: r.imgUrl ?? null,
    price: r.price ?? null,
    balance: r.balance,
    balanceUsd: r.balanceUsd,
    pctOfNav: totalUsd > 0 ? (r.balanceUsd / totalUsd) * 100 : 0,
  }));
}

/** Synthetic holdings row for native ETH (it's not stored in portfolio_positions). */
function nativeEthPosition(
  balance: number,
  usd: number,
  totalValueUsd: number
): PortfolioPosition {
  return {
    tokenAddress: NATIVE_ETH_ADDRESS,
    symbol: "ETH",
    name: "Ethereum",
    network: "Base",
    imgUrl: ETH_IMG_URL,
    price: balance > 0 ? usd / balance : null,
    balance,
    balanceUsd: usd,
    pctOfNav: totalValueUsd > 0 ? (usd / totalValueUsd) * 100 : 0,
  };
}

export async function getPortfolioOverview(): Promise<PortfolioOverview> {
  const [meta, rows] = await Promise.all([getPortfolioMeta(), getNavSeries()]);

  // The chart/deltas run on the ex-native-ETH basis (matches Zapper history). The
  // headline NAV and holdings ADD native ETH back in (the chart intentionally won't
  // line up with the headline — native ETH has no historical series).
  const navExEthUsd = meta?.totalUsd ?? rows.at(-1)?.valueUsd ?? 0;
  const nativeEthUsd = meta?.nativeEthUsd ?? 0;
  const nativeEthBalance = meta?.nativeEthBalance ?? 0;
  const totalValueUsd = navExEthUsd + nativeEthUsd;

  const tokenPositions = await getPositions(totalValueUsd);
  const positions =
    nativeEthBalance > 0 || nativeEthUsd > 0
      ? [nativeEthPosition(nativeEthBalance, nativeEthUsd, totalValueUsd), ...tokenPositions]
      : tokenPositions;

  const series: NavPoint[] = rows.map((r) => ({ date: r.date, valueUsd: r.valueUsd }));

  return {
    meta,
    totalValueUsd,
    navExEthUsd,
    series,
    positions,
    deltas: computeDeltas(series, navExEthUsd),
  };
}
