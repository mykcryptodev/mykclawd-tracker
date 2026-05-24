/**
 * One-time seed: populates yankees_bets from the existing polymarket-bets.json log.
 * Run with: npx tsx scripts/seed-yankees-bets.ts
 */

import { runMigrations } from "../db/migrate";
import { db } from "../db/client";
import { yankeesBets } from "../db/schema";
import { readFileSync } from "fs";
import { join } from "path";

interface RawBet {
  date: string;
  market?: string;
  side: "YES" | "NO";
  amount: number;
  shares?: number | null;
  odds: number;
  payout?: number | null;
  result?: "WIN" | "LOSS" | null;
  profit?: number | null;
  note?: string;
  bet_placed?: boolean;
  tweet_id?: string;
}

async function main() {
  await runMigrations();

  const jsonPath = join(
    process.env.HOME ?? "",
    ".openclaw/workspace/skills/yankees-calendar/data/polymarket-bets.json"
  );

  let raw: RawBet[] = [];
  try {
    raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch {
    console.warn("No polymarket-bets.json found at", jsonPath, "— seeding hardcoded data only");
  }

  // Merge with hardcoded canonical data (in case JSON is missing)
  const BETS: RawBet[] = raw.length > 0 ? raw : [
    {
      date: "2026-04-23", side: "YES", amount: 15, odds: 0.575, payout: 25.75,
      result: "WIN", profit: 10.75, tweet_id: "2047333221143072982",
      note: "5-game win streak + series lead vs BOS",
    },
    {
      date: "2026-04-24", side: "YES", amount: 10, odds: 0.57, payout: 17.54,
      result: "WIN", profit: 7.54,
      note: "6-game win streak",
    },
    {
      date: "2026-04-25", side: "YES", amount: 15, odds: 0.58, payout: 25.86,
      result: "WIN", profit: 10.86, tweet_id: "2047892013865988270",
      note: "7-game win streak + series lead vs HOU",
    },
    {
      date: "2026-04-26", side: "YES", amount: 5, odds: 0.555, payout: 8.93,
      result: "LOSS", profit: -5, tweet_id: "2048228982953328807",
      note: "8-game win streak + series lead vs HOU (G3)",
    },
    {
      date: "2026-05-24", side: "NO", amount: 10, odds: 0.51,
      result: null, profit: null, bet_placed: false,
      note: "3-game losing streak — bet placement failed (TLS error)",
    },
  ];

  // Derive opponent from note or market slug
  function guessOpponent(bet: RawBet): string {
    const note = bet.note ?? "";
    const market = bet.market ?? "";
    const patterns: [RegExp, string][] = [
      [/vs\s+BOS|vs Boston/i, "BOS"],
      [/vs\s+HOU|vs Houston/i, "HOU"],
      [/vs\s+TOR|vs Toronto/i, "TOR"],
      [/vs\s+TB|TBR|Tampa/i, "TB"],
      [/vs\s+BAL|Baltimore/i, "BAL"],
      [/vs\s+MIN|Minnesota/i, "MIN"],
      [/vs\s+CLE|Cleveland/i, "CLE"],
      [/vs\s+DET|Detroit/i, "DET"],
      [/vs\s+KC|Kansas/i, "KC"],
      [/vs\s+CWS|Chicago\s+W/i, "CWS"],
      [/vs\s+TEX|Texas/i, "TEX"],
      [/vs\s+SEA|Seattle/i, "SEA"],
      [/vs\s+OAK|Oakland|Athletics/i, "OAK"],
      [/vs\s+LAA|Angels/i, "LAA"],
      [/vs\s+NYM|Mets/i, "NYM"],
      [/nyy-bos|bos-nyy/, "BOS"],
      [/nyy-hou|hou-nyy/, "HOU"],
      [/nyy-tor|tor-nyy/, "TOR"],
      [/nyy-tb|tb-nyy|nyy-tbr|tbr-nyy/, "TB"],
    ];
    for (const [re, abbr] of patterns) {
      if (re.test(note) || re.test(market)) return abbr;
    }
    return "NYY";
  }

  for (const bet of BETS) {
    const row = {
      date: bet.date,
      opponent: guessOpponent(bet),
      side: bet.side,
      amount: bet.amount,
      odds: bet.odds,
      payout: bet.payout ?? null,
      result: (bet.result ?? null) as "WIN" | "LOSS" | null,
      profit: bet.profit ?? null,
      note: bet.note ?? null,
      betPlaced: bet.bet_placed !== false,
      tweetId: bet.tweet_id ?? null,
      createdAt: new Date().toISOString(),
    };

    await db
      .insert(yankeesBets)
      .values(row)
      .onConflictDoUpdate({
        target: yankeesBets.date,
        set: {
          result: row.result,
          profit: row.profit,
          payout: row.payout,
          tweetId: row.tweetId,
        },
      });

    console.log(`  ✓ ${row.date} ${row.side} $${row.amount} vs ${row.opponent} → ${row.result ?? "pending"}`);
  }

  console.log(`\nSeeded ${BETS.length} bets.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
