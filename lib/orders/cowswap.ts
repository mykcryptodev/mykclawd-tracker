/**
 * CoW Protocol order fetcher — Base mainnet orders for a wallet.
 * https://api.cow.fi/base/api/v1/account/{owner}/orders
 *
 * Paginates with offset/limit (newest first) until the API returns a short page.
 * All statuses (open, filled, cancelled, expired, presign, …) share the same list and
 * count toward offset pagination — there is no server-side status filter.
 */

const COW_BASE = "https://api.cow.fi/base/api/v1";

/** CoW API max `limit` per request. */
export const COW_ORDERS_PAGE_SIZE = 1000;

export type CowOrderStatus =
  | "open"
  | "fulfilled"
  | "cancelled"
  | "expired"
  | "presignaturePending"
  | "unknown";

export interface CowOrder {
  uid: string;
  status: CowOrderStatus;
  kind: "sell" | "buy";
  class: "market" | "limit" | "liquidity";
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  executedSellAmount: string;
  executedBuyAmount: string;
  executedFee: string;
  feeAmount: string;
  validTo: number; // unix seconds
  creationDate: string; // ISO
  partiallyFillable: boolean;
  invalidated: boolean;
}

export interface NormalizedOrder {
  source: "cowswap";
  orderId: string;
  status: string;
  side: "buy" | "sell";
  type: string; // "limit" | "market" etc
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  executedSellAmount: string;
  executedBuyAmount: string;
  fee: string;
  expiresAt: number | null;
  createdAt: string;
  partiallyFillable: boolean;
}

export interface FetchCowswapOrdersOptions {
  /** Optional safety cap for tests; default is no cap (fetch until API exhausted). */
  maxOrders?: number;
  /** Page size per request (default COW_ORDERS_PAGE_SIZE, capped at 1000). */
  pageSize?: number;
}

function normalizeCowOrder(o: CowOrder): NormalizedOrder {
  return {
    source: "cowswap" as const,
    orderId: o.uid,
    status: mapCowStatus(o),
    side: o.kind,
    type: o.class,
    sellToken: o.sellToken?.toLowerCase() ?? "",
    buyToken: o.buyToken?.toLowerCase() ?? "",
    sellAmount: o.sellAmount,
    buyAmount: o.buyAmount,
    executedSellAmount: o.executedSellAmount,
    executedBuyAmount: o.executedBuyAmount,
    fee: o.executedFee || o.feeAmount,
    expiresAt: o.validTo ?? null,
    createdAt: o.creationDate,
    partiallyFillable: o.partiallyFillable,
  };
}

async function fetchCowswapOrdersPage(
  walletAddress: string,
  offset: number,
  limit: number
): Promise<CowOrder[]> {
  const owner = walletAddress.toLowerCase();
  const url = `${COW_BASE}/account/${owner}/orders?offset=${offset}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CoW API ${res.status}: ${text.slice(0, 200)}`);
  }

  const orders: CowOrder[] = await res.json();
  return Array.isArray(orders) ? orders : [];
}

export async function fetchCowswapOrders(
  walletAddress: string,
  options: FetchCowswapOrdersOptions = {}
): Promise<NormalizedOrder[]> {
  const maxOrders = options.maxOrders != null ? Math.max(1, options.maxOrders) : undefined;
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? COW_ORDERS_PAGE_SIZE),
    COW_ORDERS_PAGE_SIZE
  );

  const all: NormalizedOrder[] = [];
  let offset = 0;

  while (maxOrders == null || all.length < maxOrders) {
    const limit =
      maxOrders == null ? pageSize : Math.min(pageSize, maxOrders - all.length);
    const page = await fetchCowswapOrdersPage(walletAddress, offset, limit);
    all.push(...page.map(normalizeCowOrder));

    if (page.length < limit) break;
    offset += page.length;
  }

  return all;
}

function mapCowStatus(o: CowOrder): string {
  if (o.invalidated) return "cancelled";
  switch (o.status) {
    case "fulfilled":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "presignaturePending":
      return "presign";
    case "open":
      return "open";
    default:
      return o.status;
  }
}
