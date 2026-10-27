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
import { isCashToken, normalizeToken } from "../pnl/swaps";

export interface NavPoint {
  date: string; // YYYY-MM-DD (UTC)
  valueUsd: number;
}

export interface Delta {
  abs: number;
  pct: number;
}

export interface TokenPnl {
  /** Weighted-average USD cost per token, from our own swap replay. */
  avgCostUsd: number;
  /** Current holding valued at cost. */
  costBasisUsd: number;
  unrealizedGain: number;
  /** Move against average cost. Null when the whole position was free. */
  unrealizedGainPct: number | null;
  /** Booked on actual sale proceeds, not a marked price. */
  realizedGain: number;
  totalGain: number;
  /** Quantity acquired at no cost (airdrops) — the gain on it is the full value. */
  zeroBasisQty: number;
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

/** Why a position has no PnL figures. Drives what the table renders. */
export type PnlUnavailableReason =
  /** Settlement asset — held to trade with, not a position we score. */
  | "cash"
  /** No cost-basis row yet (on-chain sync has not covered this token). */
  | "no-basis"
  /**
   * Basis exists but contradicts the live balance, or a disposal exceeded the
   * tracked quantity — the transfer history does not reach the original buy.
   */
  | "incomplete-history";

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
  /** Set whenever `pnl` is null, so the UI can explain the blank. */
  pnlUnavailable: PnlUnavailableReason | null;
  orders: PortfolioOrder[];
}

export interface PortfolioMeta {
  syncedAt: number;
  totalUsd: number;
  tokenCount: number;
  nativeEthBalance: number;
  nativeEthUsd: number;
}

/**
 * Portfolio-wide PnL. Summable precisely because settlement assets are excluded
 * — every dollar here is attributed to exactly one position.
 */
export interface PortfolioPnlTotals {
  unrealizedGain: number;
  realizedGain: number;
  totalGain: number;
  costBasisUsd: number;
  /** Positions contributing to the totals. */
  coveredPositions: number;
  /** Positions left out because basis is missing or untrustworthy. */
  uncoveredPositions: number;
}

export interface PortfolioOverview {
  meta: PortfolioMeta | null;
  totalValueUsd: number;
  /** @deprecated Kept for API compatibility; now the same total-NAV basis as totalValueUsd. */
  navExEthUsd: number;
  series: NavPoint[];
  positions: PortfolioPosition[];
  pnlTotals: PortfolioPnlTotals;
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

/**
 * Largest relative gap allowed between the quantity our replay tracked and the
 * live on-chain balance before we stop trusting the basis. A mismatch means the
 * transfer history missed movements, so any PnL derived from it would be wrong.
 */
const MAX_QUANTITY_DRIFT = 0.01;

interface BasisRow {
  quantity: number;
  avgCostUsd: number;
  realizedPnlUsd: number;
  zeroBasisQty: number;
  basisComplete: boolean;
}

/**
 * Derives a position's PnL from our own cost basis, or explains why it can't.
 * Exported for tests.
 */
export function computeTokenPnl(
  balance: number,
  priceUsd: number | null,
  basis: BasisRow | undefined,
  isCash: boolean
): { pnl: TokenPnl | null; unavailable: PnlUnavailableReason | null } {
  if (isCash) return { pnl: null, unavailable: "cash" };
  if (!basis) return { pnl: null, unavailable: "no-basis" };

  const drift =
    balance > 0
      ? Math.abs(basis.quantity - balance) / balance
      : basis.quantity > 0
        ? 1
        : 0;

  if (!basis.basisComplete || drift > MAX_QUANTITY_DRIFT) {
    return { pnl: null, unavailable: "incomplete-history" };
  }

  const price = priceUsd ?? 0;
  const costBasisUsd = balance * basis.avgCostUsd;
  const unrealizedGain = balance * price - costBasisUsd;
  const realizedGain = basis.realizedPnlUsd;

  return {
    pnl: {
      avgCostUsd: basis.avgCostUsd,
      costBasisUsd,
      unrealizedGain,
      // A position acquired entirely for free has no cost to measure against.
      unrealizedGainPct:
        basis.avgCostUsd > 0 ? (price / basis.avgCostUsd - 1) * 100 : null,
      realizedGain,
      totalGain: unrealizedGain + realizedGain,
      zeroBasisQty: basis.zeroBasisQty,
    },
    unavailable: null,
  };
}

export function sumPortfolioPnl(positions: PortfolioPosition[]): PortfolioPnlTotals {
  const totals: PortfolioPnlTotals = {
    unrealizedGain: 0,
    realizedGain: 0,
    totalGain: 0,
    costBasisUsd: 0,
    coveredPositions: 0,
    uncoveredPositions: 0,
  };

  for (const p of positions) {
    if (!p.pnl) {
      // Cash is not a position, so it is not "uncovered" — it is out of scope.
      if (p.pnlUnavailable !== "cash") totals.uncoveredPositions++;
      continue;
    }
    totals.unrealizedGain += p.pnl.unrealizedGain;
    totals.realizedGain += p.pnl.realizedGain;
    totals.totalGain += p.pnl.totalGain;
    totals.costBasisUsd += p.pnl.costBasisUsd;
    totals.coveredPositions++;
  }

  return totals;
}

export async function getPositions(
  totalUsd: number,
  ordersMap: Map<string, PortfolioOrder[]>
): Promise<PortfolioPosition[]> {
  const [rows, lotRows] = await Promise.all([
    db.select().from(portfolioPositions).orderBy(desc(portfolioPositions.balanceUsd)).all(),
    db.select().from(lots).all(),
  ]);

  const basisMap = new Map<string, BasisRow>(
    lotRows.map((l) => [
      normalizeToken(l.tokenAddress),
      {
        quantity: Number(l.quantity) || 0,
        avgCostUsd: l.avgCostUsd,
        realizedPnlUsd: l.realizedPnlUsd,
        zeroBasisQty: l.zeroBasisQty,
        basisComplete: l.basisComplete,
      },
    ])
  );

  return rows.map((r) => {
    const token = normalizeToken(r.tokenAddress);
    const { pnl, unavailable } = computeTokenPnl(
      r.balance,
      r.price ?? null,
      basisMap.get(token),
      isCashToken(token)
    );

    // Deduplicate orders for this token by orderId
    const seen = new Set<string>();
    const orders: PortfolioOrder[] = [];
    for (const o of ordersMap.get(token) ?? []) {
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
      pnlUnavailable: unavailable,
      avgCostUsd: pnl?.avgCostUsd ?? null,
      orders,
    };
  });
}

/** Position + orders for one holding (the /pnl/[token] detail page). */
export async function getPositionDetail(tokenAddress: string): Promise<{
  meta: PortfolioMeta | null;
  position: PortfolioPosition | null;
}> {
  const addr = tokenAddress.toLowerCase();
  const [meta, ordersMap] = await Promise.all([getPortfolioMeta(), getOrdersMap()]);
  const positions = await getPositions(meta?.totalUsd ?? 0, ordersMap);
  return {
    meta,
    position: positions.find((p) => p.tokenAddress.toLowerCase() === addr) ?? null,
  };
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
    pnlTotals: sumPortfolioPnl(positions),
    deltas: computeDeltas(series, totalValueUsd),
  };
}
