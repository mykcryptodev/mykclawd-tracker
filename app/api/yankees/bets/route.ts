import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { yankeesBets } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { desc, sql } from "drizzle-orm";

let migrated = false;

// Full-season backfill — strategy applied retroactively to every completed game.
// YES = bet Yankees win | NO = bet Yankees lose
// Real Polymarket bets (Apr 23-26) have exact odds/payout. All others use estimated odds.
const SEED_BETS = [
  { date: "2026-03-28", opponent: "SF", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-03-30", opponent: "SEA", side: "YES" as const, amount: 10, odds: 0.57, payout: null, result: "LOSS" as const, profit: -10, note: "2+ win streak (3W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-03-31", opponent: "SEA", side: "YES" as const, amount: 10, odds: 0.56, payout: 17.86, result: "WIN" as const, profit: 7.86, note: "Bounce-back (lost 1 after 3W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-03", opponent: "MIA", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "2+ win streak (2W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-04", opponent: "MIA", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-05", opponent: "MIA", side: "YES" as const, amount: 15, odds: 0.575, payout: null, result: "LOSS" as const, profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-07", opponent: "OAK", side: "YES" as const, amount: 10, odds: 0.56, payout: 17.86, result: "WIN" as const, profit: 7.86, note: "Bounce-back (lost 1 after 4W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-11", opponent: "TB", side: "NO" as const, amount: 10, odds: 0.52, payout: 19.23, result: "WIN" as const, profit: 9.23, note: "3+ game losing streak (3L)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-12", opponent: "TB", side: "NO" as const, amount: 10, odds: 0.52, payout: 19.23, result: "WIN" as const, profit: 9.23, note: "3+ game losing streak (4L)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-13", opponent: "LAA", side: "NO" as const, amount: 10, odds: 0.52, payout: null, result: "LOSS" as const, profit: -10, note: "3+ game losing streak (5L)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-19", opponent: "KC", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-21", opponent: "BOS", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "2+ win streak (3W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-22", opponent: "BOS", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-23", opponent: "BOS", side: "YES" as const, amount: 15, odds: 0.575, payout: 25.75, result: "WIN" as const, profit: 10.75, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: "2047333221143072982", createdAt: new Date().toISOString() },
  { date: "2026-04-24", opponent: "HOU", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "2+ win streak (6W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-25", opponent: "HOU", side: "YES" as const, amount: 15, odds: 0.58, payout: 25.86, result: "WIN" as const, profit: 10.86, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: "2047892013865988270", createdAt: new Date().toISOString() },
  { date: "2026-04-26", opponent: "HOU", side: "YES" as const, amount: 15, odds: 0.555, payout: 8.93, result: "LOSS" as const, profit: -5, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: "2048228982953328807", createdAt: new Date().toISOString() },
  { date: "2026-04-27", opponent: "TEX", side: "YES" as const, amount: 10, odds: 0.56, payout: 17.86, result: "WIN" as const, profit: 7.86, note: "Bounce-back (lost 1 after 8W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-29", opponent: "TEX", side: "YES" as const, amount: 15, odds: 0.575, payout: null, result: "LOSS" as const, profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-03", opponent: "BAL", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-04", opponent: "BAL", side: "YES" as const, amount: 15, odds: 0.575, payout: 26.09, result: "WIN" as const, profit: 11.09, note: "2+ win streak + G4 of series, up 3-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-05", opponent: "TEX", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "2+ win streak (4W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-06", opponent: "TEX", side: "YES" as const, amount: 10, odds: 0.57, payout: null, result: "LOSS" as const, profit: -10, note: "2+ win streak (5W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-07", opponent: "TEX", side: "YES" as const, amount: 10, odds: 0.56, payout: 17.86, result: "WIN" as const, profit: 7.86, note: "Bounce-back (lost 1 after 5W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-09", opponent: "MIL", side: "NO" as const, amount: 10, odds: 0.52, payout: 19.23, result: "WIN" as const, profit: 9.23, note: "Opponent leading series 1-0, G2", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-10", opponent: "MIL", side: "NO" as const, amount: 10, odds: 0.52, payout: 19.23, result: "WIN" as const, profit: 9.23, note: "Opponent leading series 2-0, G3", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-11", opponent: "BAL", side: "NO" as const, amount: 10, odds: 0.52, payout: 19.23, result: "WIN" as const, profit: 9.23, note: "3+ game losing streak (3L)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-12", opponent: "BAL", side: "NO" as const, amount: 10, odds: 0.52, payout: null, result: "LOSS" as const, profit: -10, note: "3+ game losing streak (4L)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-20", opponent: "TOR", side: "YES" as const, amount: 15, odds: 0.575, payout: null, result: "LOSS" as const, profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-24", opponent: "TB", side: "NO" as const, amount: 10, odds: 0.52, payout: null, result: null, profit: null, note: "3-game losing streak — bet placement failed (TLS error)", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
] satisfies (typeof yankeesBets.$inferInsert)[];

export async function GET() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  // Auto-upsert seed data if DB has fewer rows than the canonical list.
  // This handles: first deploy, new Turso DB, and backfill additions.
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(yankeesBets)
    .then((r) => Number(r[0]?.n ?? 0));

  if (count < SEED_BETS.length) {
    await db
      .insert(yankeesBets)
      .values(SEED_BETS)
      .onConflictDoUpdate({
        target: yankeesBets.date,
        set: {
          result: sql`excluded.result`,
          profit: sql`excluded.profit`,
          payout: sql`excluded.payout`,
          tweetId: sql`excluded.tweet_id`,
        },
      });
  }

  const bets = await db
    .select()
    .from(yankeesBets)
    .orderBy(desc(yankeesBets.date));

  return NextResponse.json({ bets }, { headers: { "Cache-Control": "no-store" } });
}

// POST — called by the cron job to record a new bet
export async function POST(req: Request) {
  const token = req.headers.get("x-sync-token");
  if (token !== process.env.SYNC_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  const body = await req.json() as typeof yankeesBets.$inferInsert;
  await db
    .insert(yankeesBets)
    .values({ ...body, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: yankeesBets.date,
      set: {
        result: body.result,
        profit: body.profit,
        payout: body.payout,
        tweetId: body.tweetId,
      },
    });

  return NextResponse.json({ ok: true });
}
