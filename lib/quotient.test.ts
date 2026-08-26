import { describe, expect, it } from "vitest";
import {
  closeReasonLabel,
  computeQuotientStats,
  inferExecutionStatus,
  inferLiveStatus,
  type QuotientPositionSnapshot,
} from "./quotient";

const base: QuotientPositionSnapshot = {
  signalId: "s1",
  marketId: null,
  headline: "Market",
  slug: "market",
  side: "YES",
  status: "open",
  executionStatus: "shadow",
  liveStatus: "none",
  liveSkipReason: null,
  liveSkippedAt: null,
  shadowStakeUsd: 25,
  shadowEntryCost: 70,
  shadowExitCost: null,
  shadowPnlUsd: null,
  shadowRoiPct: null,
  liveStakeUsd: null,
  liveEntryUsdc: null,
  liveEntryPrice: null,
  liveEntryShares: null,
  liveExitUsdc: null,
  liveExitPrice: null,
  liveExitShares: null,
  livePnlUsd: null,
  liveRoiPct: null,
  liveEntryTx: null,
  liveExitTx: null,
  liveEntryOrderId: null,
  liveExitOrderId: null,
  entryRef: null,
  targetCost: null,
  volume24h: null,
  publishedAt: null,
  enteredAt: null,
  closedAt: null,
  closeReason: null,
  liveCloseReason: null,
  endDate: null,
};

describe("Quotient status helpers", () => {
  it("infers real live rows from fill fields even without explicit status", () => {
    const p = { ...base, executionStatus: undefined, liveStatus: undefined, liveEntryTx: "0xabc", liveEntryUsdc: 25 };
    expect(inferExecutionStatus(p)).toBe("real");
    expect(inferLiveStatus(p)).toBe("open");
  });

  it("infers skipped live attempts from executor log metadata", () => {
    const p = { ...base, executionStatus: undefined, liveStatus: undefined, liveSkipReason: "max_concurrent 4 reached" };
    expect(inferExecutionStatus(p)).toBe("live_skipped");
    expect(inferLiveStatus(p)).toBe("skipped");
  });

  it("keeps realized live P&L separate from shadow P&L and open cost basis", () => {
    const positions = [
      { ...base, signalId: "real-open", executionStatus: "real" as const, liveStatus: "open" as const, liveEntryUsdc: 25, liveEntryTx: "0x1" },
      { ...base, signalId: "real-closed", status: "closed" as const, executionStatus: "real" as const, liveStatus: "closed" as const, shadowPnlUsd: 10, shadowRoiPct: 40, liveEntryUsdc: 25, livePnlUsd: 2.62, liveExitTx: "0x2" },
      { ...base, signalId: "paper-closed", status: "closed" as const, shadowPnlUsd: 5, shadowRoiPct: 20 },
      { ...base, signalId: "skipped", executionStatus: "live_skipped" as const, liveStatus: "skipped" as const, liveSkipReason: "max_concurrent 4 reached" },
    ];

    expect(computeQuotientStats(positions)).toMatchObject({
      shadowPnl: 15,
      livePnl: 2.62,
      liveClosed: 1,
      liveOpen: 1,
      liveOpenCostBasis: 25,
      liveSkippedCount: 1,
    });
  });

  it("labels current close reason values", () => {
    expect(closeReasonLabel("time_stop_7d")).toBe("Time stop (7d)");
    expect(closeReasonLabel("market_held-to-day7")).toBe("Held to day 7");
    expect(closeReasonLabel("market_resolved")).toBe("Market resolved");
  });
});
