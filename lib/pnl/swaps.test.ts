import { describe, expect, it } from "vitest";
import {
  NATIVE_ETH,
  WETH,
  classifyTransaction,
  groupTransfersToSwaps,
  isCashToken,
  normalizeToken,
  type TransferLeg,
  type ValuationContext,
} from "./swaps";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const VELVET = "0xbf927b841994731c573bdf09ceb0c6b0aa887cdd";
const POD = "0xed664536023d8e4b1640c394777d34abaff1df8f";

/** 2026-07-24, the date of the real VELVET sale used below. */
const ctx: ValuationContext = { ethPriceForDate: () => 2000 };
const noEthPrice: ValuationContext = { ethPriceForDate: () => null };

const TS = Math.floor(Date.parse("2026-07-24T00:48:00Z") / 1000);

function leg(
  tokenAddress: string,
  direction: "in" | "out",
  amount: number,
  txHash = "0xtx1",
  blockTimestamp = TS
): TransferLeg {
  return { txHash, blockTimestamp, tokenAddress, direction, amount };
}

describe("token classification", () => {
  it("treats stables and ETH/WETH as cash", () => {
    expect(isCashToken(USDC)).toBe(true);
    expect(isCashToken(WETH)).toBe(true);
    expect(isCashToken(NATIVE_ETH)).toBe(true);
    expect(isCashToken(VELVET)).toBe(false);
  });

  it("normalizes the 0xeee native sentinel to the zero address", () => {
    expect(normalizeToken("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")).toBe(NATIVE_ETH);
    expect(isCashToken("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(normalizeToken(USDC.toUpperCase())).toBe(USDC);
  });
});

describe("classifyTransaction", () => {
  // Ground truth from the tracked wallet, 2026-07-24: 50.990710673 VELVET sold
  // for 17.375273 USDC. Zerion marked the same trade at $18.50 using its own
  // token price — a 6.5% overstatement of proceeds. The cash leg is the fill.
  it("values a real sale from the USDC received, not a token price", () => {
    const event = classifyTransaction(
      [leg(VELVET, "out", 50.990710673), leg(USDC, "in", 17.375273)],
      ctx
    );

    expect(event).toMatchObject({ kind: "sell", token: VELVET, usdValue: 17.375273 });
    expect(event?.qty).toBeCloseTo(50.990710673, 9);
  });

  it("values a buy from the cash spent", () => {
    const event = classifyTransaction([leg(USDC, "out", 250), leg(POD, "in", 1000)], ctx);
    expect(event).toMatchObject({ kind: "buy", token: POD, qty: 1000, usdValue: 250 });
  });

  it("converts an ETH-funded buy at the ETH price for that date", () => {
    const event = classifyTransaction([leg(NATIVE_ETH, "out", 0.05), leg(POD, "in", 400)], ctx);
    expect(event).toMatchObject({ kind: "buy", token: POD, qty: 400, usdValue: 100 });
  });

  it("nets multi-hop legs of the same token into one event", () => {
    const event = classifyTransaction(
      [
        leg(USDC, "out", 300),
        leg(USDC, "in", 50), // refunded dust
        leg(POD, "in", 600),
        leg(POD, "in", 400),
      ],
      ctx
    );
    expect(event).toMatchObject({ kind: "buy", token: POD, qty: 1000, usdValue: 250 });
  });

  it("classifies a token received with no cash paid as a zero-basis receive", () => {
    const event = classifyTransaction([leg(POD, "in", 500)], ctx);
    expect(event).toMatchObject({ kind: "receive", token: POD, qty: 500, usdValue: null });
  });

  it("classifies a token sent with no cash received as a send", () => {
    const event = classifyTransaction([leg(POD, "out", 500)], ctx);
    expect(event).toMatchObject({ kind: "send", token: POD, qty: 500, usdValue: null });
  });

  it("classifies a token-for-token trade as an exchange carrying basis", () => {
    const event = classifyTransaction([leg(POD, "out", 100), leg(VELVET, "in", 20)], ctx);
    expect(event).toMatchObject({
      kind: "exchange",
      token: VELVET,
      qty: 20,
      usdValue: null,
      counterToken: POD,
      counterQty: 100,
    });
  });

  it("marks settlement-only transactions as cash, never a position event", () => {
    const wrap = classifyTransaction([leg(NATIVE_ETH, "out", 1), leg(WETH, "in", 1)], ctx);
    expect(wrap).toMatchObject({ kind: "cash", token: null });
  });

  it("degrades to receive/send rather than inventing a value when ETH price is unknown", () => {
    const event = classifyTransaction(
      [leg(NATIVE_ETH, "out", 0.05), leg(POD, "in", 400)],
      noEthPrice
    );
    expect(event).toMatchObject({ kind: "receive", token: POD, usdValue: null });
  });

  it("skips transactions touching more than two position tokens", () => {
    const event = classifyTransaction(
      [leg(POD, "in", 1), leg(VELVET, "in", 2), leg("0xdead", "in", 3)],
      ctx
    );
    expect(event).toBeNull();
  });

  it("ignores dust-only consideration", () => {
    const event = classifyTransaction([leg(USDC, "out", 0.001), leg(POD, "in", 10)], ctx);
    expect(event).toMatchObject({ kind: "receive", usdValue: null });
  });
});

describe("groupTransfersToSwaps", () => {
  it("groups by transaction, drops cash-only txs, and sorts oldest first", () => {
    const events = groupTransfersToSwaps(
      [
        leg(USDC, "in", 17.375273, "0xsell", TS + 100),
        leg(VELVET, "out", 50.990710673, "0xsell", TS + 100),
        leg(POD, "in", 1000, "0xbuy", TS),
        leg(USDC, "out", 250, "0xbuy", TS),
        leg(WETH, "in", 1, "0xwrap", TS + 50),
        leg(NATIVE_ETH, "out", 1, "0xwrap", TS + 50),
      ],
      ctx
    );

    expect(events.map((e) => e.kind)).toEqual(["buy", "sell"]);
    expect(events[0]).toMatchObject({ token: POD, usdValue: 250 });
    expect(events[1]).toMatchObject({ token: VELVET, usdValue: 17.375273 });
  });
});
