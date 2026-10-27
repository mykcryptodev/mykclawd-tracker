import { describe, expect, it } from "vitest";
import {
  computeTokenPnl,
  sumPortfolioPnl,
  type PortfolioPosition,
} from "./read";

const basis = {
  quantity: 100,
  avgCostUsd: 2,
  realizedPnlUsd: 25,
  zeroBasisQty: 0,
  basisComplete: true,
};

describe("computeTokenPnl", () => {
  it("values unrealized gain against our own average cost", () => {
    const { pnl } = computeTokenPnl(100, 3, basis, false);

    expect(pnl).toMatchObject({
      avgCostUsd: 2,
      costBasisUsd: 200,
      unrealizedGain: 100,
      realizedGain: 25,
      totalGain: 125,
    });
    expect(pnl!.unrealizedGainPct).toBeCloseTo(50, 10);
  });

  it("reports a loss when price is below cost", () => {
    const { pnl } = computeTokenPnl(100, 1, basis, false);
    expect(pnl!.unrealizedGain).toBe(-100);
    expect(pnl!.unrealizedGainPct).toBeCloseTo(-50, 10);
  });

  it("never scores settlement assets", () => {
    const result = computeTokenPnl(3173, 1, basis, true);
    expect(result.pnl).toBeNull();
    expect(result.unavailable).toBe("cash");
  });

  it("reports no-basis when the token has never been replayed", () => {
    const result = computeTokenPnl(100, 3, undefined, false);
    expect(result.pnl).toBeNull();
    expect(result.unavailable).toBe("no-basis");
  });

  it("refuses to report PnL when a disposal exceeded tracked quantity", () => {
    const result = computeTokenPnl(100, 3, { ...basis, basisComplete: false }, false);
    expect(result.pnl).toBeNull();
    expect(result.unavailable).toBe("incomplete-history");
  });

  // The guard that protects against a stale `transfers` table: if the replayed
  // quantity disagrees with the live balance, the basis is built on a partial
  // history and any PnL from it would be confidently wrong.
  it("refuses to report PnL when replayed quantity drifts from the live balance", () => {
    const result = computeTokenPnl(150, 3, basis, false);
    expect(result.pnl).toBeNull();
    expect(result.unavailable).toBe("incomplete-history");
  });

  it("tolerates sub-1% drift from rounding", () => {
    const result = computeTokenPnl(100.5, 3, basis, false);
    expect(result.pnl).not.toBeNull();
  });

  it("flags a live balance with no tracked quantity as incomplete", () => {
    const result = computeTokenPnl(0, 3, basis, false);
    expect(result.unavailable).toBe("incomplete-history");
  });

  it("omits a percentage for a position acquired entirely for free", () => {
    const { pnl } = computeTokenPnl(
      100,
      3,
      { quantity: 100, avgCostUsd: 0, realizedPnlUsd: 0, zeroBasisQty: 100, basisComplete: true },
      false
    );
    expect(pnl!.unrealizedGain).toBe(300);
    expect(pnl!.unrealizedGainPct).toBeNull();
    expect(pnl!.zeroBasisQty).toBe(100);
  });

  it("treats a missing price as zero rather than throwing", () => {
    const { pnl } = computeTokenPnl(100, null, basis, false);
    expect(pnl!.unrealizedGain).toBe(-200);
  });
});

function position(over: Partial<PortfolioPosition>): PortfolioPosition {
  return {
    tokenAddress: "0xtoken",
    avgCostUsd: null,
    symbol: "TKN",
    name: "Token",
    network: "Base",
    imgUrl: null,
    price: 1,
    balance: 0,
    balanceUsd: 0,
    pctOfNav: 0,
    change1dUsd: null,
    change1dPct: null,
    pnl: null,
    pnlUnavailable: null,
    orders: [],
    ...over,
  };
}

describe("sumPortfolioPnl", () => {
  it("adds up only positions with a trustworthy basis", () => {
    const totals = sumPortfolioPnl([
      position({
        pnl: {
          avgCostUsd: 2,
          costBasisUsd: 200,
          unrealizedGain: 100,
          unrealizedGainPct: 50,
          realizedGain: 25,
          totalGain: 125,
          zeroBasisQty: 0,
        },
      }),
      position({
        pnl: {
          avgCostUsd: 1,
          costBasisUsd: 50,
          unrealizedGain: -10,
          unrealizedGainPct: -20,
          realizedGain: 0,
          totalGain: -10,
          zeroBasisQty: 0,
        },
      }),
      position({ pnl: null, pnlUnavailable: "incomplete-history" }),
    ]);

    expect(totals).toMatchObject({
      unrealizedGain: 90,
      realizedGain: 25,
      totalGain: 115,
      costBasisUsd: 250,
      coveredPositions: 2,
      uncoveredPositions: 1,
    });
  });

  it("does not count cash rows as uncovered positions", () => {
    const totals = sumPortfolioPnl([
      position({ pnl: null, pnlUnavailable: "cash" }),
      position({ pnl: null, pnlUnavailable: "cash" }),
    ]);

    expect(totals.uncoveredPositions).toBe(0);
    expect(totals.coveredPositions).toBe(0);
  });

  it("returns zeroes for an empty portfolio", () => {
    expect(sumPortfolioPnl([])).toMatchObject({ totalGain: 0, coveredPositions: 0 });
  });
});
