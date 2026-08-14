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
  status?: string;
  stake_usd?: number;
  entry_price?: number;
  exit_price?: number;
  pnl_usd?: number;
  entry_tx?: string;
  exit_tx?: string;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
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
    shadowStakeUsd: number | null;
    shadowEntryCost: number | null;
    shadowExitCost: number | null;
    shadowPnlUsd: number | null;
    shadowRoiPct: number | null;
    liveStakeUsd: number | null;
    liveEntryPrice: number | null;
    liveExitPrice: number | null;
    livePnlUsd: number | null;
    liveEntryTx: string | null;
    liveExitTx: string | null;
    entryRef: number | null;
    targetCost: number | null;
    volume24h: number | null;
    publishedAt: string | null;
    enteredAt: string | null;
    closedAt: string | null;
    closeReason: string | null;
    endDate: string | null;
  }
  const positions: PositionRow[] = [];
  let openCount = 0;
  let closedCount = 0;
  let shadowPnl = 0;
  let livePnl = 0;

  for (const sp of Object.values(shadow.positions)) {
    if (!sp.signal_id) continue;
    const lp = liveBySignal[sp.signal_id];
    const status = sp.status === "closed" ? "closed" : "open";
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
      shadowStakeUsd: sp.stake_usd ?? null,
      shadowEntryCost: sp.entry_cost ?? null,
      shadowExitCost: sp.exit_cost ?? null,
      shadowPnlUsd: sp.pnl_usd ?? null,
      shadowRoiPct: sp.roi_pct ?? null,
      liveStakeUsd: lp?.stake_usd ?? null,
      liveEntryPrice: lp?.entry_price ?? null,
      liveExitPrice: lp?.exit_price ?? null,
      livePnlUsd: lp?.pnl_usd ?? null,
      liveEntryTx: lp?.entry_tx ?? null,
      liveExitTx: lp?.exit_tx ?? null,
      entryRef: sp.entry_ref ?? null,
      targetCost: sp.target_cost ?? null,
      volume24h: sp.volume24h ?? null,
      publishedAt: sp.published_at ?? null,
      enteredAt: sp.entered_at ?? null,
      closedAt: sp.closed_at ?? null,
      closeReason: sp.close_reason ?? null,
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
  } catch (e) {
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
