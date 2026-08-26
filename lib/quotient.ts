export type QuotientLegStatus = "open" | "closed" | "skipped" | "none";
export type QuotientExecutionStatus = "real" | "shadow" | "live_skipped";

export interface QuotientPositionSnapshot {
  signalId: string;
  marketId: string | null;
  headline: string;
  slug: string;
  side: "YES" | "NO";
  status: "open" | "closed";
  executionStatus: QuotientExecutionStatus;
  liveStatus: QuotientLegStatus;
  liveSkipReason: string | null;
  liveSkippedAt: string | null;
  shadowStakeUsd: number | null;
  shadowEntryCost: number | null;
  shadowExitCost: number | null;
  shadowPnlUsd: number | null;
  shadowRoiPct: number | null;
  liveStakeUsd: number | null;
  liveEntryUsdc: number | null;
  liveEntryPrice: number | null;
  liveEntryShares: number | null;
  liveExitUsdc: number | null;
  liveExitPrice: number | null;
  liveExitShares: number | null;
  livePnlUsd: number | null;
  liveRoiPct: number | null;
  liveEntryTx: string | null;
  liveExitTx: string | null;
  liveEntryOrderId: string | null;
  liveExitOrderId: string | null;
  entryRef: number | null;
  targetCost: number | null;
  volume24h: number | null;
  publishedAt: string | null;
  enteredAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  liveCloseReason: string | null;
  endDate: string | null;
  syncedAt?: number;
}

export interface QuotientStats {
  open: number;
  closed: number;
  shadowWins: number;
  shadowPnl: number;
  winRate: number;
  avgRoi: number;
  livePnl: number;
  liveWins: number;
  liveClosed: number;
  liveOpen: number;
  liveOpenCostBasis: number;
  liveRealCount: number;
  liveSkippedCount: number;
}

export function hasLiveFill(position: Pick<QuotientPositionSnapshot,
  "liveEntryTx" | "liveEntryOrderId" | "liveEntryUsdc" | "liveStakeUsd" | "liveEntryPrice"
>): boolean {
  return Boolean(
    position.liveEntryTx ||
      position.liveEntryOrderId ||
      typeof position.liveEntryUsdc === "number" ||
      typeof position.liveStakeUsd === "number" ||
      typeof position.liveEntryPrice === "number",
  );
}

export function inferExecutionStatus(position: Omit<Pick<QuotientPositionSnapshot,
  "executionStatus" | "liveStatus" | "liveSkipReason" | "liveSkippedAt" | "liveEntryTx" | "liveEntryOrderId" | "liveEntryUsdc" | "liveStakeUsd" | "liveEntryPrice"
>, "executionStatus" | "liveStatus"> & { executionStatus?: QuotientExecutionStatus; liveStatus?: QuotientLegStatus }): QuotientExecutionStatus {
  if (hasLiveFill(position)) return "real";
  if (position.liveStatus === "skipped" || position.liveSkipReason || position.liveSkippedAt) return "live_skipped";
  if (position.executionStatus) return position.executionStatus;
  return "shadow";
}

export function inferLiveStatus(position: Omit<Pick<QuotientPositionSnapshot,
  "liveStatus" | "status" | "livePnlUsd" | "liveExitTx" | "liveExitOrderId" | "liveSkipReason" | "liveSkippedAt" | "liveEntryTx" | "liveEntryOrderId" | "liveEntryUsdc" | "liveStakeUsd" | "liveEntryPrice"
>, "liveStatus"> & { liveStatus?: QuotientLegStatus }): QuotientLegStatus {
  if (position.liveSkipReason || position.liveSkippedAt) return "skipped";
  if (!hasLiveFill(position)) return "none";
  if (position.liveStatus === "open" || position.liveStatus === "closed") return position.liveStatus;
  if (position.livePnlUsd !== null || position.liveExitTx || position.liveExitOrderId || position.status === "closed") return "closed";
  return "open";
}

export function liveCostBasis(position: Pick<QuotientPositionSnapshot, "liveEntryUsdc" | "liveStakeUsd">): number | null {
  return position.liveEntryUsdc ?? position.liveStakeUsd ?? null;
}

export function computeQuotientStats(positions: (Omit<QuotientPositionSnapshot, "executionStatus" | "liveStatus"> & { executionStatus?: QuotientExecutionStatus; liveStatus?: QuotientLegStatus })[]): QuotientStats {
  const closed = positions.filter((p) => p.status === "closed");
  const open = positions.filter((p) => p.status === "open");
  const shadowWins = closed.filter((p) => (p.shadowPnlUsd ?? 0) > 0).length;
  const shadowPnl = closed.reduce((s, p) => s + (p.shadowPnlUsd ?? 0), 0);
  const real = positions.filter((p) => inferExecutionStatus(p) === "real");
  const liveClosed = real.filter((p) => inferLiveStatus(p) === "closed" && p.livePnlUsd !== null);
  const liveOpen = real.filter((p) => inferLiveStatus(p) === "open");
  const livePnl = liveClosed.reduce((s, p) => s + (p.livePnlUsd ?? 0), 0);
  const liveWins = liveClosed.filter((p) => (p.livePnlUsd ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (shadowWins / closed.length) * 100 : 0;
  const avgRoi = closed.length > 0
    ? closed.reduce((s, p) => s + (p.shadowRoiPct ?? 0), 0) / closed.length
    : 0;

  return {
    open: open.length,
    closed: closed.length,
    shadowWins,
    shadowPnl,
    winRate,
    avgRoi,
    livePnl,
    liveWins,
    liveClosed: liveClosed.length,
    liveOpen: liveOpen.length,
    liveOpenCostBasis: liveOpen.reduce((s, p) => s + (liveCostBasis(p) ?? 0), 0),
    liveRealCount: real.length,
    liveSkippedCount: positions.filter((p) => inferExecutionStatus(p) === "live_skipped").length,
  };
}

export function closeReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";

  const normalized = reason.trim().toLowerCase().replace(/[-\s]+/g, "_");
  const labels: Record<string, string> = {
    target_hit: "Target hit",
    time_stop: "Time stop",
    time_stop_7d: "Time stop (7d)",
    market_held_to_day7: "Held to day 7",
    market_resolved: "Market resolved",
    resolution: "Market resolved",
    resolved: "Market resolved",
    expired: "Market expired",
    manual: "Manual close",
  };

  return labels[normalized] ?? reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function polymarketUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${slug}`;
}

export function polygonscanTxUrl(tx: string | null | undefined): string | null {
  if (!tx) return null;
  return `https://polygonscan.com/tx/${tx}`;
}
