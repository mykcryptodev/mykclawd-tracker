import { describe, expect, it } from "vitest";
import { buildEthPriceLookup, replayEvents } from "./basis";
import type { SwapEvent } from "./swaps";

const POD = "0xed664536023d8e4b1640c394777d34abaff1df8f";
const VELVET = "0xbf927b841994731c573bdf09ceb0c6b0aa887cdd";

let clock = 1_750_000_000;

function event(partial: Partial<SwapEvent> & Pick<SwapEvent, "kind">): SwapEvent {
  return {
    txHash: `0x${(clock++).toString(16)}`,
    blockTimestamp: clock,
    token: POD,
    qty: 0,
    usdValue: null,
    ...partial,
  };
}

describe("buildEthPriceLookup", () => {
  const lookup = buildEthPriceLookup([
    { date: "2026-07-01", priceUsd: 1800 },
    { date: "2026-07-05", priceUsd: 2000 },
  ]);

  it("returns the price for an exact date", () => {
    expect(lookup("2026-07-05")).toBe(2000);
  });

  it("carries the last known price forward over gaps", () => {
    expect(lookup("2026-07-03")).toBe(1800);
    expect(lookup("2026-07-20")).toBe(2000);
  });

  it("returns null before any known price rather than guessing", () => {
    expect(lookup("2026-06-01")).toBeNull();
  });

  it("ignores zero prices", () => {
    expect(buildEthPriceLookup([{ date: "2026-07-01", priceUsd: 0 }])("2026-07-02")).toBeNull();
  });
});

describe("replayEvents", () => {
  it("computes average cost across multiple buys", () => {
    const state = replayEvents([
      event({ kind: "buy", qty: 100, usdValue: 100 }), // $1.00
      event({ kind: "buy", qty: 100, usdValue: 300 }), // $3.00
    ]);

    const lot = state.get(POD)!;
    expect(lot.quantity).toBe(200);
    expect(lot.avgCostUsd).toBeCloseTo(2, 10);
    expect(lot.realizedPnlUsd).toBe(0);
  });

  it("realizes the difference between proceeds and carried cost", () => {
    const state = replayEvents([
      event({ kind: "buy", qty: 100, usdValue: 200 }), // $2.00 each
      event({ kind: "sell", qty: 50, usdValue: 150 }), // $3.00 each
    ]);

    const lot = state.get(POD)!;
    expect(lot.quantity).toBe(50);
    expect(lot.avgCostUsd).toBeCloseTo(2, 10);
    expect(lot.realizedPnlUsd).toBeCloseTo(50, 10); // 50 × ($3 − $2)
  });

  // The 2026-07-24 VELVET sale, priced off the USDC actually received rather
  // than Zerion's $18.50 mark for the same trade.
  it("uses real fill proceeds for realized PnL", () => {
    const state = replayEvents([
      event({ kind: "buy", token: VELVET, qty: 50.990710673, usdValue: 30 }),
      event({ kind: "sell", token: VELVET, qty: 50.990710673, usdValue: 17.375273 }),
    ]);

    const lot = state.get(VELVET)!;
    expect(lot.quantity).toBeCloseTo(0, 9);
    expect(lot.realizedPnlUsd).toBeCloseTo(17.375273 - 30, 6);
  });

  it("treats an airdrop as zero basis and flags the quantity", () => {
    const state = replayEvents([event({ kind: "receive", qty: 500 })]);

    const lot = state.get(POD)!;
    expect(lot.avgCostUsd).toBe(0);
    expect(lot.zeroBasisQty).toBe(500);
    expect(lot.complete).toBe(true);
  });

  it("realizes the full proceeds when selling an airdrop", () => {
    const state = replayEvents([
      event({ kind: "receive", qty: 100 }),
      event({ kind: "sell", qty: 100, usdValue: 40 }),
    ]);

    expect(state.get(POD)!.realizedPnlUsd).toBeCloseTo(40, 10);
  });

  it("does not realize anything when tokens merely leave the wallet", () => {
    const state = replayEvents([
      event({ kind: "buy", qty: 100, usdValue: 200 }),
      event({ kind: "send", qty: 40 }),
    ]);

    const lot = state.get(POD)!;
    expect(lot.quantity).toBe(60);
    expect(lot.avgCostUsd).toBeCloseTo(2, 10);
    expect(lot.realizedPnlUsd).toBe(0);
  });

  it("marks basis incomplete when a disposal exceeds tracked quantity", () => {
    const state = replayEvents([
      event({ kind: "buy", qty: 10, usdValue: 10 }),
      event({ kind: "sell", qty: 100, usdValue: 500 }),
    ]);

    expect(state.get(POD)!.complete).toBe(false);
  });

  it("keeps basis complete for an exactly-closed position", () => {
    const state = replayEvents([
      event({ kind: "buy", qty: 100, usdValue: 100 }),
      event({ kind: "sell", qty: 100, usdValue: 120 }),
    ]);

    const lot = state.get(POD)!;
    expect(lot.complete).toBe(true);
    expect(lot.realizedPnlUsd).toBeCloseTo(20, 10);
  });

  it("carries basis through a token-for-token exchange without realizing gain", () => {
    const state = replayEvents([
      event({ kind: "buy", token: POD, qty: 100, usdValue: 250 }),
      event({
        kind: "exchange",
        token: VELVET,
        qty: 50,
        counterToken: POD,
        counterQty: 100,
      }),
    ]);

    expect(state.get(POD)!.realizedPnlUsd).toBe(0);
    expect(state.get(POD)!.quantity).toBe(0);

    const velvet = state.get(VELVET)!;
    expect(velvet.quantity).toBe(50);
    expect(velvet.avgCostUsd).toBeCloseTo(5, 10); // $250 basis over 50 tokens
  });

  it("keeps each token's lot independent", () => {
    const state = replayEvents([
      event({ kind: "buy", token: POD, qty: 10, usdValue: 100 }),
      event({ kind: "buy", token: VELVET, qty: 20, usdValue: 100 }),
    ]);

    expect(state.get(POD)!.avgCostUsd).toBeCloseTo(10, 10);
    expect(state.get(VELVET)!.avgCostUsd).toBeCloseTo(5, 10);
  });
});
