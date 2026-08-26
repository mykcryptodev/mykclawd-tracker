/**
 * Sync Quotient Mirror strategy state → tracker.
 *
 * Reads the strategy's own books (source of truth — no re-derivation):
 *   shadow: /home/mike/.openclaw/workspace/trading/strategies/quotient-mirror/state/shadow_positions.json
 *   live:   .../state/live_positions.json  (may not exist pre-go-live)
 *   config: .../config.json                (phase)
 *
 * Publishes a JSON snapshot to a GitHub gist (the production /api/quotient
 * route reads the gist — Vercel has no working DB connection for this
 * project). Also upserts into the local DB for dev parity (best-effort).
 *
 * Gist ID lives in lib/quotient-gist.ts (not secret).
 *
 * Usage: ./node_modules/.bin/tsx --env-file=.env.local scripts/sync-quotient.ts
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const STRAT_DIR =
  "/home/mike/.openclaw/workspace/trading/strategies/quotient-mirror";

const GIST_ID =
  process.env.QUOTIENT_GIST_ID ?? "308d138cff824829e8b4c6ebc25f94fc";
const GIST_FILENAME = "quotient-mirror.json";

interface ShadowPos {
  signal_id: string;
  market_id?: string;
  headline?: string;
  slug?: string;
  side?: string;
  status?: string;
  stake_usd?: number;
  entry_cost?: number;
  exit_cost?: number;
  pnl_usd?: number;
  roi_pct?: number;
  entry_ref?: number;
  target_cost?: number;
  volume24h?: number;
  published_at?: string;
  entered_at?: string;
  closed_at?: string;
  close_reason?: string;
  end_date?: string;
}

interface LivePos {
  signal_id: string;
  headline?: string;
  slug?: string;
  side?: string;
  market_id?: string;
  status?: string;
  stake_usd?: number;
  entry_usdc?: number;
  entry_price?: number;
  entry_shares?: number;
  exit_usdc?: number;
  exit_price?: number;
  exit_shares?: number;
  pnl_usd?: number;
  roi_pct?: number;
  entry_tx?: string;
  exit_tx?: string;
  entry_order_id?: string;
  exit_order_id?: string;
  entered_at?: string;
  closed_at?: string;
  close_reason?: string;
}

interface LiveLogEvent {
  ts?: string;
  type?: string;
  signal_id?: string;
  slug?: string | null;
  reason?: string;
  error?: string;
}

interface LiveSkip {
  skippedAt: string | null;
  reason: string | null;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function readLiveSkips(logPath: string): Record<string, LiveSkip> {
  let raw = "";
  try {
    raw = fs.readFileSync(logPath, "utf8");
  } catch {
    return {};
  }

  const skips: Record<string, LiveSkip> = {};
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let event: LiveLogEvent;
    try {
      event = JSON.parse(line) as LiveLogEvent;
    } catch {
      continue;
    }
    if (event.type !== "entry_skipped" || !event.signal_id) continue;
    skips[event.signal_id] = {
      skippedAt: event.ts ?? null,
      reason: event.reason ?? null,
    };
  }
  return skips;
}

function isLiveFill(lp: LivePos | undefined): lp is LivePos {
  return Boolean(
    lp &&
      (lp.entry_tx ||
        lp.entry_order_id ||
        typeof lp.entry_usdc === "number" ||
        typeof lp.stake_usd === "number" ||
        typeof lp.entry_price === "number"),
  );
}

function normalizeBookStatus(status: string | undefined): "open" | "closed" {
  return status === "closed" ? "closed" : "open";
}

function liveStatus(lp: LivePos | undefined, skip: LiveSkip | undefined): "open" | "closed" | "skipped" | "none" {
  if (isLiveFill(lp)) return normalizeBookStatus(lp.status);
  if (skip) return "skipped";
  return "none";
}

function executionStatus(lp: LivePos | undefined, skip: LiveSkip | undefined): "real" | "shadow" | "live_skipped" {
  if (isLiveFill(lp)) return "real";
  if (skip) return "live_skipped";
  return "shadow";
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const cfg = readJson<{ phase?: string }>(path.join(STRAT_DIR, "config.json"));
  const shadow = readJson<{ positions?: Record<string, ShadowPos> }>(
    path.join(STRAT_DIR, "state", "shadow_positions.json"),
  );
  const live = readJson<{ positions?: Record<string, LivePos> }>(
    path.join(STRAT_DIR, "state", "live_positions.json"),
  );
  const liveSkips = readLiveSkips(path.join(STRAT_DIR, "logs", "quotient-mirror-live.jsonl"));

  if (!shadow?.positions) {
    console.error("shadow_positions.json missing or unreadable");
    process.exit(1);
  }

  const liveBySignal = live?.positions ?? {};
  interface PositionRow {
    signalId: string;
    marketId: string | null;
    headline: string;
    slug: string;
    side: "YES" | "NO";
    status: "open" | "closed";
    executionStatus: "real" | "shadow" | "live_skipped";
    liveStatus: "open" | "closed" | "skipped" | "none";
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
  }
  const positions: PositionRow[] = [];
  let openCount = 0;
  let closedCount = 0;
  let shadowPnl = 0;
  let livePnl = 0;
  let liveOpenCount = 0;
  let liveClosedCount = 0;
  let liveSkippedCount = 0;
  let liveOpenCostBasis = 0;

  for (const sp of Object.values(shadow.positions)) {
    if (!sp.signal_id) continue;
    const lp = liveBySignal[sp.signal_id];
    const skip = liveSkips[sp.signal_id];
    const status = sp.status === "closed" ? "closed" : "open";
    const rowLiveStatus = liveStatus(lp, skip);
    if (rowLiveStatus === "open") {
      liveOpenCount++;
      liveOpenCostBasis += lp?.entry_usdc ?? lp?.stake_usd ?? 0;
    } else if (rowLiveStatus === "closed") {
      liveClosedCount++;
    } else if (rowLiveStatus === "skipped") {
      liveSkippedCount++;
    }
    if (status === "open") openCount++;
    else closedCount++;
    if (typeof sp.pnl_usd === "number") shadowPnl += sp.pnl_usd;
    if (lp && typeof lp.pnl_usd === "number") livePnl += lp.pnl_usd;

    positions.push({
      signalId: sp.signal_id,
      marketId: sp.market_id ?? null,
      headline: sp.headline ?? "",
      slug: sp.slug ?? "",
      side: sp.side === "NO" ? ("NO" as const) : ("YES" as const),
      status: status as "open" | "closed",
      executionStatus: executionStatus(lp, skip),
      liveStatus: rowLiveStatus,
      liveSkipReason: skip?.reason ?? null,
      liveSkippedAt: skip?.skippedAt ?? null,
      shadowStakeUsd: sp.stake_usd ?? null,
      shadowEntryCost: sp.entry_cost ?? null,
      shadowExitCost: sp.exit_cost ?? null,
      shadowPnlUsd: sp.pnl_usd ?? null,
      shadowRoiPct: sp.roi_pct ?? null,
      liveStakeUsd: lp?.stake_usd ?? null,
      liveEntryUsdc: lp?.entry_usdc ?? null,
      liveEntryPrice: lp?.entry_price ?? null,
      liveEntryShares: lp?.entry_shares ?? null,
      liveExitUsdc: lp?.exit_usdc ?? null,
      liveExitPrice: lp?.exit_price ?? null,
      liveExitShares: lp?.exit_shares ?? null,
      livePnlUsd: lp?.pnl_usd ?? null,
      liveRoiPct: lp?.roi_pct ?? null,
      liveEntryTx: lp?.entry_tx ?? null,
      liveExitTx: lp?.exit_tx ?? null,
      liveEntryOrderId: lp?.entry_order_id ?? null,
      liveExitOrderId: lp?.exit_order_id ?? null,
      entryRef: sp.entry_ref ?? null,
      targetCost: sp.target_cost ?? null,
      volume24h: sp.volume24h ?? null,
      publishedAt: sp.published_at ?? null,
      enteredAt: sp.entered_at ?? null,
      closedAt: sp.closed_at ?? null,
      closeReason: sp.close_reason ?? null,
      liveCloseReason: lp?.close_reason ?? null,
      endDate: sp.end_date ?? null,
    });
  }

  // newest first
  positions.sort((a, b) => (b.enteredAt ?? "").localeCompare(a.enteredAt ?? ""));

  const payload = {
    positions,
    sync: {
      syncedAt: now,
      phase: cfg?.phase ?? "shadow",
      openCount,
      closedCount,
      shadowPnlUsd: Math.round(shadowPnl * 100) / 100,
      livePnlUsd: Math.round(livePnl * 100) / 100,
      liveOpenCount,
      liveClosedCount,
      liveSkippedCount,
      liveOpenCostBasisUsd: Math.round(liveOpenCostBasis * 100) / 100,
      error: null,
    },
  };

  // ── publish to gist ──────────────────────────────────────────────────────
  const tmpFile = path.join("/tmp", GIST_FILENAME);
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2));
  try {
    execFileSync(
      "gh",
      ["api", "-X", "PATCH", `gists/${GIST_ID}`, "-F", `files[${GIST_FILENAME}][content]=@${tmpFile}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log(`gist updated: ${GIST_ID}`);
  } catch {
    // -F with @file isn't supported by gh api; fall back to raw JSON body
    const body = JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } },
    });
    execFileSync("gh", ["api", "-X", "PATCH", `gists/${GIST_ID}`, "--input", "-"], {
      input: body,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`gist updated (raw body): ${GIST_ID}`);
  }

  // ── best-effort local DB upsert (dev parity) ─────────────────────────────
  try {
    const { db } = await import("../db/client");
    const { quotientPositions, quotientSync } = await import("../db/schema");
    const { runMigrations } = await import("../db/migrate");
    await runMigrations();
    for (const p of positions) {
      await db
        .insert(quotientPositions)
        .values({ ...p, syncedAt: now })
        .onConflictDoUpdate({
          target: quotientPositions.signalId,
          set: { ...p, syncedAt: now },
        });
    }
    const syncRow = {
      syncedAt: now,
      phase: payload.sync.phase,
      openCount: payload.sync.openCount,
      closedCount: payload.sync.closedCount,
      shadowPnlUsd: payload.sync.shadowPnlUsd,
      livePnlUsd: payload.sync.livePnlUsd,
      error: null,
    };
    await db
      .insert(quotientSync)
      .values({ id: 1, ...syncRow })
      .onConflictDoUpdate({ target: quotientSync.id, set: syncRow });
  } catch {
    /* local DB optional */
  }

  console.log(
    `quotient sync ok: ${positions.length} positions (${openCount} open / ${closedCount} closed), shadow P&L $${shadowPnl.toFixed(2)}, live P&L $${livePnl.toFixed(2)}, phase=${cfg?.phase ?? "?"}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("quotient sync failed:", e);
  process.exit(1);
});
