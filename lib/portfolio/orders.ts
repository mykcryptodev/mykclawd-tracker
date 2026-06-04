import type { PortfolioOrder } from "./read";

/** Known Base token decimals for CoW / portfolio amount display. */
export const TOKEN_DECIMALS: Record<string, number> = {
  "0x0000000000000000000000000000000000000000": 18,
  "0x4200000000000000000000000000000000000006": 18, // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 6, // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18, // DAI
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 8, // cbBTC
};

export function getTokenDecimals(address: string | null | undefined): number {
  if (!address) return 18;
  return TOKEN_DECIMALS[address.toLowerCase()] ?? 18;
}

export function fmtRawTokenAmount(raw: string | null, decimals: number): string {
  if (!raw) return "—";
  try {
    const n = BigInt(raw);
    const divisor = BigInt(10 ** decimals);
    const whole = n / divisor;
    const frac = n % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole.toLocaleString("en-US")}.${fracStr}`;
  } catch {
    return raw;
  }
}

/** Whether an order is still live (default holdings view). */
export function isActivePortfolioOrder(order: Pick<PortfolioOrder, "status" | "source">): boolean {
  const s = order.status.toLowerCase();
  switch (order.source) {
    case "cowswap":
      // Only CoW "open" orders are on-book; presign/pending/filled are historical noise.
      return s === "open";
    case "bankr":
      return s === "active" || s === "paused";
    case "definitive":
      return s === "open" || s === "pending" || s === "partial";
    default:
      return false;
  }
}

export function filterPortfolioOrders(
  orders: PortfolioOrder[],
  showAll: boolean
): PortfolioOrder[] {
  if (showAll) return orders;
  return orders.filter(isActivePortfolioOrder);
}
