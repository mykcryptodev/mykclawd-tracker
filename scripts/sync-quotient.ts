/**
 * Sync Quotient Mirror strategy state into the tracker DB.
 *
 * Reads the strategy's own books (source of truth — no re-derivation):
 *   shadow: /home/mike/.openclaw/workspace/trading/strategies/quotient-mirror/state/shadow_positions.json
 *   live:   .../state/live_positions.json  (may not exist pre-go-live)
 *   config: .../config.json                (phase)
 *
 * Upserts one row per signal into quotient_positions and refreshes the
 * single-row quotient_sync metadata. Idempotent; safe to run every few minutes.
 *
 * Usage: pnpm tsx --env-file=.env.local scripts/sync-quotient.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { quotientPositions, quotientSync } from "../db/schema";
import { runMigrations } from "../db/migrate";

const STRAT_DIR =
  "/home/mike/.openclaw/workspace/trading/strategies/quotient-mirror";

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
  await runMigrations();

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
  let openCount = 0;
  let closedCount = 0;
  let shadowPnl = 0;
  let livePnl = 0;
  let upserted = 0;

  for (const sp of Object.values(shadow.positions)) {
    if (!sp.signal_id) continue;
    const lp = liveBySignal[sp.signal_id];
    const status = sp.status === "closed" ? ("closed" as const) : ("open" as const);
    if (status === "open") openCount++;
    else closedCount++;
    if (typeof sp.pnl_usd === "number") shadowPnl += sp.pnl_usd;
    if (lp && typeof lp.pnl_usd === "number") livePnl += lp.pnl_usd;

    await db
      .insert(quotientPositions)
      .values({
        signalId: sp.signal_id,
        marketId: sp.market_id ?? null,
        headline: sp.headline ?? "",
        slug: sp.slug ?? "",
        side: sp.side === "NO" ? ("NO" as const) : ("YES" as const),
        status,
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
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: quotientPositions.signalId,
        set: {
          status,
          shadowExitCost: sp.exit_cost ?? null,
          shadowPnlUsd: sp.pnl_usd ?? null,
          shadowRoiPct: sp.roi_pct ?? null,
          liveStakeUsd: lp?.stake_usd ?? null,
          liveEntryPrice: lp?.entry_price ?? null,
          liveExitPrice: lp?.exit_price ?? null,
          livePnlUsd: lp?.pnl_usd ?? null,
          liveEntryTx: lp?.entry_tx ?? null,
          liveExitTx: lp?.exit_tx ?? null,
          volume24h: sp.volume24h ?? null,
          closedAt: sp.closed_at ?? null,
          closeReason: sp.close_reason ?? null,
          syncedAt: now,
        },
      });
    upserted++;
  }

  await db
    .insert(quotientSync)
    .values({
      id: 1,
      syncedAt: now,
      phase: cfg?.phase ?? "shadow",
      openCount,
      closedCount,
      shadowPnlUsd: Math.round(shadowPnl * 100) / 100,
      livePnlUsd: Math.round(livePnl * 100) / 100,
      error: null,
    })
    .onConflictDoUpdate({
      target: quotientSync.id,
      set: {
        syncedAt: now,
        phase: cfg?.phase ?? "shadow",
        openCount,
        closedCount,
        shadowPnlUsd: Math.round(shadowPnl * 100) / 100,
        livePnlUsd: Math.round(livePnl * 100) / 100,
        error: null,
      },
    });

  console.log(
    `quotient sync ok: ${upserted} positions (${openCount} open / ${closedCount} closed), shadow P&L $${shadowPnl.toFixed(2)}, live P&L $${livePnl.toFixed(2)}, phase=${cfg?.phase ?? "?"}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("quotient sync failed:", e);
  process.exit(1);
});
