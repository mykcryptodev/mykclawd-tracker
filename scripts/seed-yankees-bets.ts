/**
 * Full-season seed: upserts all yankees_bets from the computed strategy backfill.
 * Run with: npx tsx scripts/seed-yankees-bets.ts
 */

import { runMigrations } from "../db/migrate";
import { db } from "../db/client";
import { yankeesBets } from "../db/schema";

const BETS: (typeof yankeesBets.$inferInsert)[] = [
  { date: "2026-03-28", opponent: "SF", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-03-30", opponent: "SEA", side: "YES", amount: 10, odds: 0.57, payout: null, result: "LOSS", profit: -10, note: "2+ win streak (3W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-03-31", opponent: "SEA", side: "YES", amount: 10, odds: 0.56, payout: 17.86, result: "WIN", profit: 7.86, note: "Bounce-back (lost 1 after 3W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-03", opponent: "MIA", side: "YES", amount: 10, odds: 0.57, payout: 17.54, result: "WIN", profit: 7.54, note: "2+ win streak (2W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-04", opponent: "MIA", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-05", opponent: "MIA", side: "YES", amount: 15, odds: 0.575, payout: null, result: "LOSS", profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-07", opponent: "OAK", side: "YES", amount: 10, odds: 0.56, payout: 17.86, result: "WIN", profit: 7.86, note: "Bounce-back (lost 1 after 4W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-19", opponent: "KC", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-21", opponent: "BOS", side: "YES", amount: 10, odds: 0.57, payout: 17.54, result: "WIN", profit: 7.54, note: "2+ win streak (3W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-22", opponent: "BOS", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-23", opponent: "BOS", side: "YES", amount: 15, odds: 0.575, payout: 25.75, result: "WIN", profit: 10.75, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: "2047333221143072982", createdAt: new Date().toISOString() },
  { date: "2026-04-24", opponent: "HOU", side: "YES", amount: 10, odds: 0.57, payout: 17.54, result: "WIN", profit: 7.54, note: "2+ win streak (6W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-25", opponent: "HOU", side: "YES", amount: 15, odds: 0.58, payout: 25.86, result: "WIN", profit: 10.86, note: "2+ win streak + G2 of series, up 1-0", betPlaced: true, tweetId: "2047892013865988270", createdAt: new Date().toISOString() },
  { date: "2026-04-26", opponent: "HOU", side: "YES", amount: 15, odds: 0.555, payout: 8.93, result: "LOSS", profit: -5, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: "2048228982953328807", createdAt: new Date().toISOString() },
  { date: "2026-04-27", opponent: "TEX", side: "YES", amount: 10, odds: 0.56, payout: 17.86, result: "WIN", profit: 7.86, note: "Bounce-back (lost 1 after 8W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-29", opponent: "TEX", side: "YES", amount: 15, odds: 0.575, payout: null, result: "LOSS", profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-03", opponent: "BAL", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-04", opponent: "BAL", side: "YES", amount: 15, odds: 0.575, payout: 26.09, result: "WIN", profit: 11.09, note: "2+ win streak + G4 of series, up 3-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-05", opponent: "TEX", side: "YES", amount: 10, odds: 0.57, payout: 17.54, result: "WIN", profit: 7.54, note: "2+ win streak (4W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-06", opponent: "TEX", side: "YES", amount: 10, odds: 0.57, payout: null, result: "LOSS", profit: -10, note: "2+ win streak (5W)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-07", opponent: "TEX", side: "YES", amount: 10, odds: 0.56, payout: 17.86, result: "WIN", profit: 7.86, note: "Bounce-back (lost 1 after 5W streak)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-20", opponent: "TOR", side: "YES", amount: 15, odds: 0.575, payout: null, result: "LOSS", profit: -15, note: "2+ win streak + G3 of series, up 2-0", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-24", opponent: "TB", side: "NO", amount: 10, odds: 0.51, payout: null, result: "LOSS", profit: -10, note: "3-game losing streak (L vs TBR, L vs TOR x2). Rule: NO $10. Bet placement failed (TLS error). Outcome: Yankees WON — would have been LOSS on NO bet.", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-27", opponent: "KCR", side: "YES", amount: 15, odds: 0.585, payout: 25.64, result: "WIN", profit: 10.64, note: "3-game win streak + Game 3 of series (Yankees lead 2-0 vs KCR). Rule: high-confidence series lead.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-29", opponent: "ATH", side: "YES", amount: 10, odds: 0.585, payout: 17.094017, result: "WIN", profit: 7.09, note: "4-game win streak (W-TBR + KCR 3-game sweep). Rule: standard YES $10. Yankees won 8-2 vs ATH.", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-30", opponent: "ATH", side: "YES", amount: 15, odds: 0.585, payout: 25.641026, result: "LOSS", profit: -15, note: "5-game win streak + Game 2 of series (Yankees lead 1-0 vs ATH). Rule: high-confidence YES $15. ATH 6, NYY 4.", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-31", opponent: "ATH", side: "YES", amount: 15, odds: 0.585, payout: 25.641026, result: "WIN", profit: 10.64, note: "5-game win streak + Game 3 of series (Yankees lead 2-0 vs ATH). Rule: high-confidence YES $15. NYY 13, ATH 8 — historic 13-run 3rd inning.", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-02", opponent: "CLE", side: "YES", amount: 15, odds: 0.397, payout: 22.779694, result: null, profit: null, note: "Yankees vs Cleveland June 2. FOK order filled via py_clob_client_v2.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
];

async function main() {
  await runMigrations();

  for (const row of BETS) {
    await db
      .insert(yankeesBets)
      .values(row)
      .onConflictDoUpdate({
        target: yankeesBets.date,
        set: { opponent: row.opponent, result: row.result, profit: row.profit, payout: row.payout, odds: row.odds, note: row.note, tweetId: row.tweetId },
      });
    console.log(`  ✓ ${row.date} ${row.side} $${row.amount} vs ${row.opponent} → ${row.result ?? "pending"}`);
  }

  console.log(`\nSeeded ${BETS.length} bets.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
