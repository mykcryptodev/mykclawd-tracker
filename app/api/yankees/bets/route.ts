import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { yankeesBets } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { desc, sql } from "drizzle-orm";

let migrated = false;

// Canonical bet history — auto-seeded on first request when table is empty.
// The cron job (yankees-calendar skill) writes new rows via POST.
const SEED_BETS = [
  { date: "2026-04-23", opponent: "BOS", side: "YES" as const, amount: 15, odds: 0.575, payout: 25.75, result: "WIN" as const, profit: 10.75, note: "5-game win streak + series lead vs BOS", betPlaced: true, tweetId: "2047333221143072982", createdAt: new Date().toISOString() },
  { date: "2026-04-24", opponent: "HOU", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "6-game win streak", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-25", opponent: "HOU", side: "YES" as const, amount: 15, odds: 0.58, payout: 25.86, result: "WIN" as const, profit: 10.86, note: "7-game win streak + series lead vs HOU", betPlaced: true, tweetId: "2047892013865988270", createdAt: new Date().toISOString() },
  { date: "2026-04-26", opponent: "HOU", side: "YES" as const, amount: 5, odds: 0.555, payout: 8.93, result: "LOSS" as const, profit: -5, note: "8-game win streak + series lead vs HOU (G3)", betPlaced: true, tweetId: "2048228982953328807", createdAt: new Date().toISOString() },
  { date: "2026-05-24", opponent: "TB", side: "NO" as const, amount: 10, odds: 0.51, payout: null, result: null, profit: null, note: "3-game losing streak — bet placement failed (TLS error)", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
] satisfies (typeof yankeesBets.$inferInsert)[];

export async function GET() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  // Auto-seed if empty (first deploy, new Turso DB, etc.)
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(yankeesBets)
    .then((r) => Number(r[0]?.n ?? 0));

  if (count === 0) {
    await db.insert(yankeesBets).values(SEED_BETS).onConflictDoNothing();
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
