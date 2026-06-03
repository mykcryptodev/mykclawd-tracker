// Read layer for the portfolio page. Pure DB reads + period-change math derived
// from the cached Zerion data. Never calls external APIs (that only happens on sync).

import { db } from "../../db/client";
import {
  portfolioNav,
  portfolioPositions,
  portfolioSync,
  portfolioOrders,
} from "../../db/schema";
import { asc, desc, eq, or } from "drizzle-orm";
import { NATIVE_ETH_ADDRESS } from "./zapper";

/** Zerion icon for native ETH on Base */
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

export interface TokenPnl {
  realizedGain: number | null;
  unrealizedGain: number | null;
  totalGain: number | null;
  totalGainPct: number | null;
  realizedGainPct: number | null;
  unrealizedGainPct: number | null;
  totalInvested: number | null;
}

export interface PortfolioOrder {
  orderId: string;
  source: "cowswap" | "bankr" | "definitive";
  status: string;
  type: string;
  side: "buy" | "sell" | null;
  sellToken: string | null;
  buyToken: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  sellAmount: string | null;
  buyAmount: string | null;
  executedSellAmount: string | null;
  executedBuyAmount: string | null;
  fee: string | null;
  quantity: string | null;
  filledQuantity: string | null;
  priceUsd: number | null;
  expiresAt: number | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  pctOfNav: number;
  change1dUsd: number | null;
  change1dPct: number | null;
  pnl: TokenPnl | null;
  orders: PortfolioOrder[];
}

export interface PortfolioMeta {
  syncedAt: number;
  totalUsd: number;
  tokenCount: number;
  nativeEthBalance: number;
  nativeEthUsd: number;
}

export interface PortfolioOverview {
  meta: PortfolioMeta | null;
  totalValueUsd: number;
  navExEthUsd: number;
  series: NavPoint[];
  positions: PortfolioPosition[];
  deltas: {
    d1: Delta | null;
    d7: Delta | null;
    d30: Delta | null;
  };
}

// ── pure helpers ─────────────────────────────────────────────────────────────

export function daysAgoUtc(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function navAtOrBefore(series: NavPoint[], targetDate: string): NavPoint | null {
  let match: NavPoint | null = null;
  for (const p of series) {
    if (p.date <= targetDate) match = p;
    else break;
  }
  return match;
}

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
  return db
    .select({
      date: portfolioNav.date,
      valueUsd: portfolioNav.valueUsd,
      source: portfolioNav.source,
    })
    .from(portfolioNav)
    .orderBy(asc(portfolioNav.date))
    .all();
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

/** Fetch all orders from DB as a map: tokenAddress (lowercase) → orders[] */
async function getOrdersMap(): Promise<Map<string, PortfolioOrder[]>> {
  const rows = await db
    .select()
    .from(portfolioOrders)
    .orderBy(desc(portfolioOrders.createdAt))
    .all();

  const map = new Map<string, PortfolioOrder[]>();

  const addToMap = (key: string | null | undefined, order: PortfolioOrder) => {
    if (!key || typeof key !== "string") return;
    const k = key.toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(order);
  };

  for (const r of rows) {
    const order: PortfolioOrder = {
      orderId: r.orderId,
      source: r.source as "cowswap" | "bankr" | "definitive",
      status: r.status,
      type: r.type,
      side: r.side as "buy" | "sell" | null,
      sellToken: r.sellToken ?? null,
      buyToken: r.buyToken ?? null,
      tokenAddress: r.tokenAddress ?? null,
      tokenSymbol: r.tokenSymbol ?? null,
      sellAmount: r.sellAmount ?? null,
      buyAmount: r.buyAmount ?? null,
      executedSellAmount: r.executedSellAmount ?? null,
      executedBuyAmount: r.executedBuyAmount ?? null,
      fee: r.fee ?? null,
      quantity: r.quantity ?? null,
      filledQuantity: r.filledQuantity ?? null,
      priceUsd: r.priceUsd ?? null,
      expiresAt: r.expiresAt ?? null,
      description: r.description ?? null,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt ?? null,
    };
    // Index by all relevant token addresses
    addToMap(r.tokenAddress, order);
    addToMap(r.sellToken, order);
    addToMap(r.buyToken, order);
  }

  return map;
}

export async function getPositions(
  totalUsd: number,
  ordersMap: Map<string, PortfolioOrder[]>
): Promise<PortfolioPosition[]> {
  const rows = await db
    .select()
    .from(portfolioPositions)
    .orderBy(desc(portfolioPositions.balanceUsd))
    .all();

  return rows.map((r) => {
    const hasPnl =
      r.realizedGain !== null ||
      r.unrealizedGain !== null ||
      r.totalGain !== null;

    const pnl: TokenPnl | null = hasPnl
      ? {
          realizedGain: r.realizedGain ?? null,
          unrealizedGain: r.unrealizedGain ?? null,
          totalGain: r.totalGain ?? null,
          totalGainPct: r.totalGainPct ?? null,
          realizedGainPct: r.realizedGainPct ?? null,
          unrealizedGainPct: r.unrealizedGainPct ?? null,
          totalInvested: r.totalInvested ?? null,
        }
      : null;

    // Deduplicate orders for this token by orderId
    const seen = new Set<string>();
    const orders: PortfolioOrder[] = [];
    for (const o of ordersMap.get(r.tokenAddress.toLowerCase()) ?? []) {
      if (!seen.has(o.orderId)) {
        seen.add(o.orderId);
        orders.push(o);
      }
    }

    return {
      tokenAddress: r.tokenAddress,
      symbol: r.symbol,
      name: r.name,
      network: r.network,
      imgUrl: r.imgUrl ?? null,
      price: r.price ?? null,
      balance: r.balance,
      balanceUsd: r.balanceUsd,
      pctOfNav: totalUsd > 0 ? (r.balanceUsd / totalUsd) * 100 : 0,
      change1dUsd: r.change1dUsd ?? null,
      change1dPct: r.change1dPct ?? null,
      pnl,
      orders,
    };
  });
}

function nativeEthPosition(
  balance: number,
  usd: number,
  totalValueUsd: number,
  ordersMap: Map<string, PortfolioOrder[]>
): PortfolioPosition {
  const orders = ordersMap.get("native") ?? ordersMap.get(NATIVE_ETH_ADDRESS.toLowerCase()) ?? [];
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
    change1dUsd: null,
    change1dPct: null,
    pnl: null,
    orders,
  };
}

export async function getPortfolioOverview(): Promise<PortfolioOverview> {
  const [meta, navRows, ordersMap] = await Promise.all([
    getPortfolioMeta(),
    getNavSeries(),
    getOrdersMap(),
  ]);

  const navExEthUsd = meta?.totalUsd ?? navRows.at(-1)?.valueUsd ?? 0;
  const nativeEthUsd = meta?.nativeEthUsd ?? 0;
  const nativeEthBalance = meta?.nativeEthBalance ?? 0;
  const totalValueUsd = navExEthUsd + nativeEthUsd;

  const tokenPositions = await getPositions(totalValueUsd, ordersMap);

  const positions =
    nativeEthBalance > 0 || nativeEthUsd > 0
      ? [
          nativeEthPosition(nativeEthBalance, nativeEthUsd, totalValueUsd, ordersMap),
          ...tokenPositions,
        ]
      : tokenPositions;

  const series: NavPoint[] = navRows.map((r) => ({ date: r.date, valueUsd: r.valueUsd }));

  return {
    meta,
    totalValueUsd,
    navExEthUsd,
    series,
    positions,
    deltas: computeDeltas(series, navExEthUsd),
  };
}
