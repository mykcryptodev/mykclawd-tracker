/**
 * Groups raw wallet transfers into swap events and values each one from the
 * cash counter-leg rather than a price oracle on the traded token.
 *
 * Why: pricing a memecoin leg off a daily oracle close (the old engine) or off a
 * provider's own mark (Zerion) both drift from what actually settled. Every trade
 * in this wallet pairs the token against USDC or WETH/ETH in the same transaction,
 * so the cash side *is* the USD amount — exact to the fill, no token oracle needed.
 *
 * All amounts here are human units (already divided by decimals).
 */

/** Canonical native-ETH key used by this module and the `lots` table. */
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

/** Alternate native sentinel used by lib/rpc.ts + the transfer ingest. */
const NATIVE_ETH_ALT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const WETH = "0x4200000000000000000000000000000000000006";

/** Settlement assets. Held for trading, not positions we report PnL on. */
const STABLES = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
]);

const ETH_LIKE = new Set([NATIVE_ETH, WETH]);

/** Dust threshold — ignores rounding-residue legs that would create phantom swaps. */
const MIN_USD = 0.01;
const MIN_QTY = 1e-12;

export function normalizeToken(address: string): string {
  const a = address.trim().toLowerCase();
  return a === NATIVE_ETH_ALT ? NATIVE_ETH : a;
}

/** True for settlement assets: stables plus ETH/WETH. */
export function isCashToken(address: string): boolean {
  const a = normalizeToken(address);
  return STABLES.has(a) || ETH_LIKE.has(a);
}

export interface TransferLeg {
  txHash: string;
  blockTimestamp: number;
  tokenAddress: string;
  direction: "in" | "out";
  /** Human units, positive. */
  amount: number;
}

export type SwapKind =
  /** Position token acquired by spending cash. Basis = cash spent. */
  | "buy"
  /** Position token disposed of for cash. Proceeds = cash received. */
  | "sell"
  /** Position token in with no cash out — airdrop/deposit. Zero basis. */
  | "receive"
  /** Position token out with no cash in — withdrawal. Removed at carrying cost. */
  | "send"
  /** Position token swapped directly for another position token. */
  | "exchange"
  /** Only settlement assets moved (wrap, bridge, stable rotation). Not a position event. */
  | "cash";

export interface SwapEvent {
  kind: SwapKind;
  txHash: string;
  blockTimestamp: number;
  /** Position token this event is about. Null for `cash`. */
  token: string | null;
  /** Quantity of `token` moved, positive. */
  qty: number;
  /**
   * USD value of the cash counter-leg. Null when there was no cash side
   * (`receive`, `send`, `exchange`, `cash`).
   */
  usdValue: number | null;
  /** For `exchange`: the token given up. */
  counterToken?: string;
  /** For `exchange`: quantity of `counterToken` given up. */
  counterQty?: number;
}

/** Net movement of one token within a single transaction. */
interface NetLeg {
  token: string;
  /** Positive = received, negative = sent. */
  net: number;
}

function netByToken(legs: TransferLeg[]): NetLeg[] {
  const sums = new Map<string, number>();
  for (const leg of legs) {
    const token = normalizeToken(leg.tokenAddress);
    const signed = leg.direction === "in" ? leg.amount : -leg.amount;
    sums.set(token, (sums.get(token) ?? 0) + signed);
  }
  return [...sums.entries()]
    .filter(([, net]) => Math.abs(net) > MIN_QTY)
    .map(([token, net]) => ({ token, net }));
}

export interface ValuationContext {
  /**
   * USD price of 1 ETH on the given UTC date (YYYY-MM-DD). Return null when
   * unknown — the affected swap degrades to `receive`/`send` rather than being
   * valued with a made-up number.
   */
  ethPriceForDate: (date: string) => number | null;
}

function utcDate(blockTimestamp: number): string {
  return new Date(blockTimestamp * 1000).toISOString().slice(0, 10);
}

/** USD value of a settlement-asset amount. Null when ETH price is unavailable. */
function cashUsd(token: string, amount: number, date: string, ctx: ValuationContext): number | null {
  if (STABLES.has(token)) return amount;
  const ethPrice = ctx.ethPriceForDate(date);
  return ethPrice === null ? null : amount * ethPrice;
}

/**
 * Collapses the transfers of one transaction into a single position event.
 *
 * Exported for tests; `groupTransfersToSwaps` is the normal entry point.
 */
export function classifyTransaction(
  legs: TransferLeg[],
  ctx: ValuationContext
): SwapEvent | null {
  if (legs.length === 0) return null;

  const txHash = legs[0].txHash;
  const blockTimestamp = Math.min(...legs.map((l) => l.blockTimestamp));
  const date = utcDate(blockTimestamp);

  const nets = netByToken(legs);
  if (nets.length === 0) return null;

  const positions = nets.filter((n) => !isCashToken(n.token));
  const cash = nets.filter((n) => isCashToken(n.token));

  const base = { txHash, blockTimestamp };

  // Settlement-only transaction: wraps, bridges, stable rotation. Never a position event.
  if (positions.length === 0) {
    return { ...base, kind: "cash", token: null, qty: 0, usdValue: null };
  }

  // Direct token-for-token swap: no cash side to value against, so basis carries
  // over from the token given up (handled by the replay, not here).
  if (positions.length === 2) {
    const received = positions.find((p) => p.net > 0);
    const given = positions.find((p) => p.net < 0);
    if (received && given) {
      return {
        ...base,
        kind: "exchange",
        token: received.token,
        qty: received.net,
        usdValue: null,
        counterToken: given.token,
        counterQty: -given.net,
      };
    }
  }

  // More than two position tokens in one tx is not a trade we can attribute
  // (batch claim, LP action). Skip rather than guess.
  if (positions.length !== 1) return null;

  const position = positions[0];
  const qty = Math.abs(position.net);

  // Net cash moved the opposite way from the position token is the consideration.
  let cashUsdTotal: number | null = 0;
  for (const c of cash) {
    const value = cashUsd(c.token, Math.abs(c.net), date, ctx);
    if (value === null) {
      cashUsdTotal = null;
      break;
    }
    // Cash flowing opposite the position token is consideration; same direction
    // (e.g. leftover dust returned) nets against it.
    cashUsdTotal += Math.sign(c.net) === Math.sign(position.net) ? -value : value;
  }

  const hasConsideration = cashUsdTotal !== null && cashUsdTotal >= MIN_USD;

  if (position.net > 0) {
    return hasConsideration
      ? { ...base, kind: "buy", token: position.token, qty, usdValue: cashUsdTotal }
      : { ...base, kind: "receive", token: position.token, qty, usdValue: null };
  }

  return hasConsideration
    ? { ...base, kind: "sell", token: position.token, qty, usdValue: cashUsdTotal }
    : { ...base, kind: "send", token: position.token, qty, usdValue: null };
}

/**
 * Groups a wallet's transfers into chronologically ordered position events.
 * Input order does not matter; output is sorted oldest-first.
 */
export function groupTransfersToSwaps(
  legs: TransferLeg[],
  ctx: ValuationContext
): SwapEvent[] {
  const byTx = new Map<string, TransferLeg[]>();
  for (const leg of legs) {
    const existing = byTx.get(leg.txHash);
    if (existing) existing.push(leg);
    else byTx.set(leg.txHash, [leg]);
  }

  const events: SwapEvent[] = [];
  for (const txLegs of byTx.values()) {
    const event = classifyTransaction(txLegs, ctx);
    if (event && event.kind !== "cash") events.push(event);
  }

  return events.sort(
    (a, b) => a.blockTimestamp - b.blockTimestamp || a.txHash.localeCompare(b.txHash)
  );
}
