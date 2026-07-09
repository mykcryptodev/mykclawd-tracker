// Read layer for the portfolio page. Pure DB reads + period-change math derived
// from the cached Zerion data. Never calls external APIs (that only happens on sync).

import { db } from "../../db/client";
import {
  portfolioNav,
  portfolioPositions,
  portfolioSync,
  portfolioOrders,
  lots,
} from "../../db/schema";
import { asc, desc, eq } from "drizzle-orm";

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
  avgCostUsd: number | null;
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
  /** @deprecated Kept for API compatibility; now the same total-NAV basis as totalValueUsd. */
  navExEthUsd: number;
  series: NavPoint[];
  positions: PortfolioPosition[];
  deltas: {
    d1: Delta | null;
    d7: Delta | null;
    d30: Delta | null;
  };
}

/** Base asset addresses that are normally the settlement side, not the holding an order is for. */
const QUOTE_TOKEN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000", // native ETH
  "0x4200000000000000000000000000000000000006", // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
]);

function normalizeTokenAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function tokenKeysForOrder(order: Pick<PortfolioOrder, "sellToken" | "buyToken" | "tokenAddress">): string[] {
  const explicitToken = normalizeTokenAddress(order.tokenAddress);
  if (explicitToken) return [explicitToken];

  const sellToken = normalizeTokenAddress(order.sellToken);
  const buyToken = normalizeTokenAddress(order.buyToken);

  if (sellToken && buyToken) {
    const sellIsQuote = QUOTE_TOKEN_ADDRESSES.has(sellToken);
    const buyIsQuote = QUOTE_TOKEN_ADDRESSES.has(buyToken);

    if (sellIsQuote && !buyIsQuote) return [buyToken];
    if (buyIsQuote && !sellIsQuote) return [sellToken];

    return sellToken === buyToken ? [sellToken] : [sellToken, buyToken];
  }

  return sellToken ? [sellToken] : buyToken ? [buyToken] : [];
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
  source: "live" | "zerion_history";
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
    const k = normalizeTokenAddress(key);
    if (!k) return;
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
    // Group each order under the holding it is really about. CoW orders often
    // have `side = sell` even when the user is buying a memecoin with WETH/USDC,
    // so side-based grouping puts those buys under WETH/USDC. Instead, use an
    // explicit single-token reference when providers give one, otherwise strip
    // the common quote/settlement assets and attach to the non-quote leg.
    for (const key of tokenKeysForOrder(order)) {
      addToMap(key, order);
    }
  }

  return map;
}

export async function getPositions(
  totalUsd: number,
  ordersMap: Map<string, PortfolioOrder[]>
): Promise<PortfolioPosition[]> {
  const [rows, lotRows] = await Promise.all([
    db.select().from(portfolioPositions).orderBy(desc(portfolioPositions.balanceUsd)).all(),
    db.select().from(lots).all(),
  ]);
  const lotsMap = new Map(lotRows.map((l) => [l.tokenAddress.toLowerCase(), l.avgCostUsd]));

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

    const avgCostUsd = lotsMap.get(r.tokenAddress.toLowerCase()) ?? null;
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
      avgCostUsd: avgCostUsd && avgCostUsd > 0 ? avgCostUsd : null,
      orders,
    };
  });
}

export async function getPortfolioOverview(): Promise<PortfolioOverview> {
  const [meta, navRows, ordersMap] = await Promise.all([
    getPortfolioMeta(),
    getNavSeries(),
    getOrdersMap(),
  ]);

  const totalValueUsd = meta?.totalUsd ?? navRows.at(-1)?.valueUsd ?? 0;

  const positions = await getPositions(totalValueUsd, ordersMap);

  const series: NavPoint[] = navRows.map((r) => ({ date: r.date, valueUsd: r.valueUsd }));

  return {
    meta,
    totalValueUsd,
    navExEthUsd: totalValueUsd,
    series,
    positions,
    deltas: computeDeltas(series, totalValueUsd),
  };
}
