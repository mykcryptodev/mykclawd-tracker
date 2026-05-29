// Pull the tracked wallet's NAV + token holdings from Zapper and cache them in
// our DB. Replaces the brittle transfer-replay PnL pipeline. Zapper is expensive,
// so this runs on a schedule (6h cron) + rate-limited on demand — never on render.

import { runMigrations } from "../../db/migrate";
import { db } from "../../db/client";
import { portfolioNav, portfolioPositions, portfolioSync } from "../../db/schema";
import { gt, notInArray } from "drizzle-orm";
import { fetchTokenBalances, fetchHistoricalNav } from "./zapper";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS?.trim() ||
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PortfolioSyncResult {
  totalUsd: number; // NAV, excludes native ETH
  tokenCount: number;
  nativeEthUsd: number;
  historyTicks: number;
  syncedAt: number;
  durationMs: number;
}

export async function syncPortfolioNav(
  address: string = TRACKED_ADDRESS
): Promise<PortfolioSyncResult> {
  const start = Date.now();
  await runMigrations();

  // 1. Current holdings + NAV (the critical data — persist before backfill).
  //    totalUsd / tokens EXCLUDE native ETH so they share Zapper history's basis.
  const { totalUsd, tokens, nativeEth } = await fetchTokenBalances(address);
  const syncedAt = Math.floor(Date.now() / 1000);
  const today = todayUtc();

  // Replace holdings: upsert current tokens, then drop any that are no longer held.
  for (const t of tokens) {
    await db
      .insert(portfolioPositions)
      .values({
        tokenAddress: t.tokenAddress,
        symbol: t.symbol,
        name: t.name,
        network: t.network,
        imgUrl: t.imgUrl,
        price: t.price,
        balance: t.balance,
        balanceRaw: t.balanceRaw,
        balanceUsd: t.balanceUsd,
        updatedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: portfolioPositions.tokenAddress,
        set: {
          symbol: t.symbol,
          name: t.name,
          network: t.network,
          imgUrl: t.imgUrl,
          price: t.price,
          balance: t.balance,
          balanceRaw: t.balanceRaw,
          balanceUsd: t.balanceUsd,
          updatedAt: syncedAt,
        },
      })
      .run();
  }
  const keep = tokens.map((t) => t.tokenAddress);
  if (keep.length > 0) {
    await db.delete(portfolioPositions).where(notInArray(portfolioPositions.tokenAddress, keep)).run();
  } else {
    await db.delete(portfolioPositions).run();
  }

  // Sync metadata (single row, id = 1). Native ETH is stored separately, outside NAV.
  const nativeEthBalance = nativeEth?.balance ?? 0;
  const nativeEthUsd = nativeEth?.balanceUsd ?? 0;
  await db
    .insert(portfolioSync)
    .values({
      id: 1,
      syncedAt,
      totalUsd,
      tokenCount: tokens.length,
      nativeEthBalance,
      nativeEthUsd,
      error: null,
    })
    .onConflictDoUpdate({
      target: portfolioSync.id,
      set: { syncedAt, totalUsd, tokenCount: tokens.length, nativeEthBalance, nativeEthUsd, error: null },
    })
    .run();

  // Today's live NAV point (always wins over a backfilled tick for the same day).
  await db
    .insert(portfolioNav)
    .values({ date: today, valueUsd: totalUsd, source: "live" })
    .onConflictDoUpdate({
      target: portfolioNav.date,
      set: { valueUsd: totalUsd, source: "live" },
    })
    .run();

  // 2. Backfill the historical curve from Zapper. Best-effort: a failure here must
  //    not lose the live snapshot above. historicalPortfolio also excludes native
  //    ETH, so now that our live NAV does too, the two are on the same basis and the
  //    curve is continuous — we can refresh past days straight from Zapper's daily
  //    closes. We still skip today (the live point above owns it) and drop the
  //    forward boundary tick Zapper emits at the next UTC midnight.
  let historyTicks = 0;
  try {
    const ticks = await fetchHistoricalNav(address, "YEAR");
    for (const tick of ticks) {
      if (tick.date >= today) continue;
      await db
        .insert(portfolioNav)
        .values({ date: tick.date, valueUsd: tick.valueUsd, source: "zapper_history" })
        .onConflictDoUpdate({
          target: portfolioNav.date,
          set: { valueUsd: tick.valueUsd, source: "zapper_history" },
        })
        .run();
      historyTicks++;
    }
  } catch (e) {
    console.warn(`  historicalPortfolio backfill skipped: ${(e as Error).message}`);
  }

  // Drop any future-dated rows left by a prior run's boundary tick.
  await db.delete(portfolioNav).where(gt(portfolioNav.date, today)).run();

  return {
    totalUsd,
    tokenCount: tokens.length,
    nativeEthUsd,
    historyTicks,
    syncedAt,
    durationMs: Date.now() - start,
  };
}
