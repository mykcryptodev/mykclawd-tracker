/**
 * Replays wallet swap events into per-token cost basis and realized PnL.
 *
 * Reads `transfers` (our own on-chain ingest), values each trade from its cash
 * counter-leg via lib/pnl/swaps, and writes the result to `lots`.
 *
 * Deliberately does not fall back to a token price oracle: when a trade cannot
 * be valued we record it as a zero-basis acquisition and mark the token's basis
 * incomplete, rather than writing a plausible-looking wrong number.
 */

import { db } from "../../db/client";
import { lots, prices, tokens, transfers } from "../../db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { processInbound, processOutbound, type Lot } from "./wavg";
import {
  NATIVE_ETH,
  WETH,
  groupTransfersToSwaps,
  isCashToken,
  normalizeToken,
  type SwapEvent,
  type TransferLeg,
} from "./swaps";

/** Native sentinel used by lib/rpc.ts and the transfer/price ingest. */
const NATIVE_ETH_ALT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/**
 * Decimals for settlement assets. Hardcoded because a wrong value here silently
 * scales every trade's USD value by 10^n, and these four never change.
 */
const CASH_DECIMALS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 6, // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18, // DAI
  [WETH]: 18,
  [NATIVE_ETH]: 18,
};

export interface BasisLot extends Lot {
  /** Quantity acquired with no traceable cost (airdrops, unpriceable transfers). */
  zeroBasisQty: number;
  /**
   * False once we see a disposal larger than the quantity we have tracked —
   * proof the transfer history does not reach back to the original purchase.
   */
  complete: boolean;
}

function emptyLot(): BasisLot {
  return {
    quantity: 0,
    avgCostUsd: 0,
    realizedPnlUsd: 0,
    zeroBasisQty: 0,
    complete: true,
  };
}

function humanAmount(rawAmount: string, decimals: number): number {
  const negative = rawAmount.startsWith("-");
  const raw = BigInt(negative ? rawAmount.slice(1) : rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const value = Number(whole) + Number(frac) / Number(divisor);
  return negative ? -value : value;
}

/**
 * Daily ETH/USD lookup backed by the `prices` table, falling back to the most
 * recent earlier date so a single missing day does not void a trade.
 */
export function buildEthPriceLookup(
  rows: Array<{ date: string; priceUsd: number }>
): (date: string) => number | null {
  const sorted = [...rows]
    .filter((r) => r.priceUsd > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (date: string) => {
    let match: number | null = null;
    for (const row of sorted) {
      if (row.date <= date) match = row.priceUsd;
      else break;
    }
    return match;
  };
}

/** Applies one swap event to the running lot state. */
export function applyEvent(state: Map<string, BasisLot>, event: SwapEvent): void {
  const getLot = (token: string) => state.get(token) ?? emptyLot();

  if (event.kind === "exchange") {
    // Token-for-token: no cash changed hands, so no gain is realized. The basis
    // of the token given up carries into the token received.
    const given = event.counterToken!;
    const givenQty = event.counterQty!;
    const givenLot = getLot(given);

    const carriedBasis = Math.min(givenQty, givenLot.quantity) * givenLot.avgCostUsd;
    const { lot: nextGiven } = processOutbound(givenLot, givenQty, givenLot.avgCostUsd);
    state.set(given, {
      ...nextGiven,
      zeroBasisQty: givenLot.zeroBasisQty,
      complete: givenLot.complete && givenQty <= givenLot.quantity + 1e-9,
    });

    const recvLot = getLot(event.token!);
    const unitCost = event.qty > 0 ? carriedBasis / event.qty : 0;
    const { lot: nextRecv } = processInbound(recvLot, event.qty, unitCost);
    state.set(event.token!, {
      ...nextRecv,
      zeroBasisQty: recvLot.zeroBasisQty + (carriedBasis > 0 ? 0 : event.qty),
      complete: recvLot.complete,
    });
    return;
  }

  const token = event.token!;
  const lot = getLot(token);

  switch (event.kind) {
    case "buy": {
      const unitCost = event.qty > 0 ? event.usdValue! / event.qty : 0;
      const { lot: next } = processInbound(lot, event.qty, unitCost);
      state.set(token, { ...next, zeroBasisQty: lot.zeroBasisQty, complete: lot.complete });
      return;
    }
    case "sell": {
      const unitPrice = event.qty > 0 ? event.usdValue! / event.qty : 0;
      const oversold = event.qty > lot.quantity + 1e-9;
      const { lot: next } = processOutbound(lot, event.qty, unitPrice);
      state.set(token, {
        ...next,
        zeroBasisQty: Math.min(lot.zeroBasisQty, next.quantity),
        complete: lot.complete && !oversold,
      });
      return;
    }
    case "receive": {
      // No traceable cost. Recording it at zero keeps the quantity honest and
      // shows the gain as unrealized, which is what a free token actually is.
      const { lot: next } = processInbound(lot, event.qty, 0);
      state.set(token, {
        ...next,
        zeroBasisQty: lot.zeroBasisQty + event.qty,
        complete: lot.complete,
      });
      return;
    }
    case "send": {
      // Leaving the wallet is not a sale — remove at carrying cost so nothing
      // is realized.
      const oversold = event.qty > lot.quantity + 1e-9;
      const { lot: next } = processOutbound(lot, event.qty, lot.avgCostUsd);
      state.set(token, {
        ...next,
        zeroBasisQty: Math.min(lot.zeroBasisQty, next.quantity),
        complete: lot.complete && !oversold,
      });
      return;
    }
  }
}

/** Replays events in order into final per-token lots. */
export function replayEvents(events: SwapEvent[]): Map<string, BasisLot> {
  const state = new Map<string, BasisLot>();
  for (const event of events) applyEvent(state, event);
  return state;
}

export interface ComputeBasisResult {
  eventsProcessed: number;
  tokensWritten: number;
  incompleteTokens: string[];
  transfersRead: number;
}

/**
 * Full recompute of `lots` from the transfer history. Cheap enough to run every
 * sync (a few thousand rows) and avoids the incremental-cursor drift the old
 * engine had.
 */
export async function computeCostBasis(): Promise<ComputeBasisResult> {
  const [transferRows, tokenRows, ethPriceRows] = await Promise.all([
    db.select().from(transfers).orderBy(asc(transfers.blockTimestamp)).all(),
    db.select({ address: tokens.contractAddress, decimals: tokens.decimals }).from(tokens).all(),
    db
      .select({ date: prices.date, priceUsd: prices.priceUsd })
      .from(prices)
      .where(inArray(prices.tokenAddress, [NATIVE_ETH_ALT, NATIVE_ETH, WETH]))
      .all(),
  ]);

  const decimalsByToken = new Map<string, number>();
  for (const row of tokenRows) {
    decimalsByToken.set(normalizeToken(row.address), row.decimals);
  }

  const legs: TransferLeg[] = transferRows.map((row) => {
    const token = normalizeToken(row.tokenAddress ?? NATIVE_ETH);
    const decimals = CASH_DECIMALS[token] ?? decimalsByToken.get(token) ?? 18;
    return {
      txHash: row.txHash,
      blockTimestamp: row.blockTimestamp,
      tokenAddress: token,
      direction: row.direction,
      amount: humanAmount(row.rawAmount, decimals),
    };
  });

  const events = groupTransfersToSwaps(legs, {
    ethPriceForDate: buildEthPriceLookup(ethPriceRows),
  });

  const state = replayEvents(events);

  // Settlement assets are cash, not positions — we do not report PnL on them,
  // so they are not persisted as lots.
  const incompleteTokens: string[] = [];
  let tokensWritten = 0;

  for (const [token, lot] of state.entries()) {
    if (isCashToken(token)) continue;
    if (!lot.complete) incompleteTokens.push(token);

    await db
      .insert(lots)
      .values({
        tokenAddress: token,
        quantity: lot.quantity.toString(),
        avgCostUsd: lot.avgCostUsd,
        realizedPnlUsd: lot.realizedPnlUsd,
        zeroBasisQty: lot.zeroBasisQty,
        basisComplete: lot.complete,
      })
      .onConflictDoUpdate({
        target: lots.tokenAddress,
        set: {
          quantity: lot.quantity.toString(),
          avgCostUsd: lot.avgCostUsd,
          realizedPnlUsd: lot.realizedPnlUsd,
          zeroBasisQty: lot.zeroBasisQty,
          basisComplete: lot.complete,
        },
      })
      .run();
    tokensWritten++;
  }

  return {
    eventsProcessed: events.length,
    tokensWritten,
    incompleteTokens,
    transfersRead: transferRows.length,
  };
}

/** Removes lots for tokens that no longer appear in the transfer history. */
export async function pruneStaleLots(keepTokens: string[]): Promise<void> {
  if (keepTokens.length === 0) return;
  const existing = await db.select({ token: lots.tokenAddress }).from(lots).all();
  const keep = new Set(keepTokens.map(normalizeToken));
  for (const row of existing) {
    if (!keep.has(normalizeToken(row.token))) {
      await db.delete(lots).where(eq(lots.tokenAddress, row.token)).run();
    }
  }
}
