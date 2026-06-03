/**
 * CoW Protocol order fetcher — Base mainnet orders for a wallet.
 * https://api.cow.fi/base/api/v1/account/{owner}/orders
 */

const COW_BASE = "https://api.cow.fi/base/api/v1";

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

export async function fetchCowswapOrders(
  walletAddress: string,
  limit = 50
): Promise<NormalizedOrder[]> {
  const url = `${COW_BASE}/account/${walletAddress}/orders?limit=${limit}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // no auth needed — public endpoint
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CoW API ${res.status}: ${text.slice(0, 200)}`);
  }

  const orders: CowOrder[] = await res.json();

  return orders.map((o) => ({
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
  }));
}

function mapCowStatus(o: CowOrder): string {
  if (o.invalidated) return "cancelled";
  switch (o.status) {
    case "fulfilled": return "filled";
    case "cancelled": return "cancelled";
    case "expired": return "expired";
    case "presignaturePending": return "pending";
    case "open": return "open";
    default: return o.status;
  }
}
