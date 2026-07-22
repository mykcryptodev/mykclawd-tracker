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
  { date: "2026-04-23", opponent: "BOS", side: "YES" as const, amount: 15, odds: 0.575, payout: 25.75, result: "WIN" as const, profit: 10.75, note: "5-game win streak + Game 3 of series (up 2-0 vs BOS). Rule: high-confidence series lead.", betPlaced: true, tweetId: "2047333221143072982", createdAt: new Date().toISOString() },
  { date: "2026-04-24", opponent: "HOU", side: "YES" as const, amount: 10, odds: 0.57, payout: 17.54, result: "WIN" as const, profit: 7.54, note: "6-game win streak. Rule: 2+ game win streak ($10 standard). Yankees won 12-4, W Warren (W, 3-0).", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-04-25", opponent: "HOU", side: "YES" as const, amount: 15, odds: 0.58, payout: 25.86, result: "WIN" as const, profit: 10.86, note: "7-game win streak. Rule: high-confidence ($15) — Game 2 of series vs HOU (up 1-0). Yankees won 8-3, Cruz (W, 2-0).", betPlaced: true, tweetId: "2047892013865988270", createdAt: new Date().toISOString() },
  { date: "2026-04-26", opponent: "HOU", side: "YES" as const, amount: 5, odds: 0.555, payout: 8.93, result: "LOSS" as const, profit: -5, note: "8-game win streak. Rule: high-confidence — Game 3 of series vs HOU (up 2-0). Gil vs Arrighetti, 2:10 PM ET.", betPlaced: true, tweetId: "2048228982953328807", createdAt: new Date().toISOString() },
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
  { date: "2026-05-24", opponent: "TB", side: "NO" as const, amount: 10, odds: 0.51, payout: null, result: "LOSS" as const, profit: -10, note: "3-game losing streak (L vs TBR, L vs TOR x2). Rule: NO $10 — lost last 3 in a row (L3). Bet placement FAILED TWICE — (1) bankr JSON parse error, (2) TLS cert validation error (ERR_TLS_CERT_ALTNAME_INVALID) on Polymarket order service. | Outcome: Yankees WON 2-0 (Judge walk-off HR) — bet would have LOST. Unplaced due to TLS error.", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-27", opponent: "KC", side: "YES" as const, amount: 15, odds: 0.585, payout: 25.64, result: "WIN" as const, profit: 10.64, note: "3-game win streak + Game 3 of series (Yankees lead 2-0 vs KCR). Rule: high-confidence ($15) — series lead Game 2+.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-29", opponent: "OAK", side: "YES" as const, amount: 10, odds: 0.585, payout: 17.094017, result: "WIN" as const, profit: 7.09, note: "4-game win streak (W-TBR + KCR 3-game sweep). Rule: standard YES $10 — 2+ win streak. BET PLACEMENT FAILED x2 — Polymarket signer issue persists. USDC balance: 34.19 available but signer rejected. [Game result resolved: Yankees won 8-2 vs ATH May 29]", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-30", opponent: "OAK", side: "YES" as const, amount: 15, odds: 0.585, payout: 25.641026, result: "LOSS" as const, profit: -15, note: "5-game win streak + Game 2 of series (Yankees lead 1-0 vs ATH). Rule: high-confidence YES $15 (rule 1). BET PLACEMENT FAILED — bankr signer rejected (caller_not_allowed_for_operation) — same persistent error from May 29. USDC balance: 34.19 available but signer rejected. [Game result: ATH 6, NYY 4 — Yankees LOST. Bet not placed (signer error) — would have been LOSS on YES bet.]", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-05-31", opponent: "OAK", side: "YES" as const, amount: 15, odds: 0.585, payout: 25.641026, result: "WIN" as const, profit: 10.64, note: "5-game win streak + Game 3 of series (Yankees lead 2-0 vs ATH). Rule: high-confidence YES $15 (rule 1). BET PLACEMENT FAILED — bankr signer rejected (caller_not_allowed_for_operation) — 4th consecutive failure since May 24. USDC balance available but signer rejected. [Game result: NYY 13, ATH 8 — Yankees WON historic 13-run 3rd inning. Bet not placed (signer error) — would have been WIN on YES bet.]", betPlaced: false, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-02", opponent: "CLE", side: "YES" as const, amount: 15, odds: 0.397, payout: 22.779694, result: "LOSS" as const, profit: -15, note: "Yankees vs Cleveland June 2. FOK market order filled via py_clob_client_v2 deposit wallet flow. Order ID: 0xbca78743d29d1c1b1e36c8d23201a1dc9e0366ed9884397cb7154b4c88bcb1f6. TX: 0x73ff0675f37d6700ec75e5d2f055354ef496a9ef221ff9396c45e31351e571fb. Deposited 16 pUSD from EOA to deposit wallet 0x95E59974fD31ddf12037c189152180EfBA63201A.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-03", opponent: "CLE", side: "NO" as const, amount: 10.0, odds: 0.2908, payout: 24.390242, result: "WIN" as const, profit: 14.39, note: "Game 2 of series, CLE leads 1-0 (won Game 61 9-4). NO rule 5: series deficit 0. Gavin Williams (8-3, 3.07) vs Gerrit Cole (1-0, 0.00, limited sample).", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-04", opponent: "CLE", side: "NO" as const, amount: 10.0, odds: 0.2857, payout: 25.0, result: "LOSS" as const, profit: -10, note: "Game 3 of series, CLE leads 2-0. NO rule 5: series deficit. BUY CLE token (Yankees lose). Retry after Fly proxy fix (204.8.219.79:1080). Order matched.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-06", opponent: "BOS", side: "NO" as const, amount: 10.0, odds: 0.3151, payout: 21.739129, result: "VOID" as const, profit: 0, note: "NO bet (BOS win token). Game 2 of series, BOS leads 1-0. NO rule 5: series deficit. | GAME POSTPONED — Rain. Rescheduled Aug 29. Market voided/refunded.", betPlaced: true, tweetId: "2063110815985660245", createdAt: new Date().toISOString() },
  { date: "2026-06-07", opponent: "BOS", side: "NO" as const, amount: 10.0, odds: 0.2857, payout: 25.0, result: "LOSS" as const, profit: -10, note: "Game 2 of series, BOS leads 1-0 (won June 5, 5-3; June 6 PPD). NO rule 5: series deficit.", betPlaced: true, tweetId: "2063472981691478525", createdAt: new Date().toISOString() },
  { date: "2026-06-09", opponent: "CLE", side: "YES" as const, amount: 15.0, odds: 0.3548, payout: 27.272726, result: "WIN" as const, profit: 12.27, note: "W-W streak (NYY 6-1 vs BOS June 7, NYY 7-5 vs CLE June 8). Rule 1: high-confidence 5 — 2+ win streak + Game 2 of series (Yankees lead 1-0 vs CLE).", betPlaced: true, tweetId: "2064197211831841274", createdAt: new Date().toISOString() },
  { date: "2026-06-10", opponent: "CLE", side: "YES" as const, amount: 15.0, odds: 0.3289, payout: 30.612243, result: "WIN" as const, profit: 15.61, note: "Rule 1: 3-game win streak (W June 7,8,9) + Game 3 of series + Yankees lead 2-0 vs CLE", betPlaced: true, tweetId: "2064567867907924424", createdAt: new Date().toISOString() },
  { date: "2026-06-12", opponent: "TOR", side: "YES" as const, amount: 10, odds: 0.3421, payout: 19.230768, result: "LOSS" as const, profit: -10.0, note: "4-game win streak (W June 7,8,9,10). Rule 2: standard YES $10 — 2+ win streak, Game 1 of new series vs TOR.", betPlaced: true, tweetId: "2064921870902665665", createdAt: new Date().toISOString() },
  { date: "2026-06-13", opponent: "TOR", side: "YES" as const, amount: 10, odds: 0.3506, payout: 18.518517, result: "WIN" as const, profit: 8.52, note: "Bounce-back rule: lost exactly 1 game after 4-game win streak (June 7-10). YES $10.", betPlaced: true, tweetId: "2065646767400509850", createdAt: new Date().toISOString() },
  { date: "2026-06-16", opponent: "CHW", side: "YES" as const, amount: 10, odds: 0.3671, payout: 17.241378, result: "WIN" as const, profit: 7.24, note: "2-game win streak (June 13 W + June 14 W). Rule 2: standard YES $10.", betPlaced: true, tweetId: "2066839550362538118", createdAt: new Date().toISOString() },
  { date: "2026-06-17", opponent: "CWS", side: "YES" as const, amount: 15.0, odds: 0.625, payout: 23.809521, result: "WIN" as const, profit: 8.81, note: "3-game win streak + Game 2 of CHW series + Yankees lead 1-0. Rule 1: YES $15 high confidence.", betPlaced: true, tweetId: "2067096208565207392", createdAt: new Date().toISOString() },
  { date: "2026-06-18", opponent: "CHW", side: "YES" as const, amount: 15.0, odds: 0.585, payout: 25.423727, result: "LOSS" as const, profit: -15, note: "4-game win streak + Game 3 of CHW series, Yankees lead 2-0. Rule 1: YES $15 high confidence.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-19", opponent: "CIN", side: "YES" as const, amount: 10, odds: 0.4152, payout: 14.084506, result: "WIN" as const, profit: 4.08, note: "Bounce-back rule: lost exactly 1 (June 18 vs CHW) after 4-game win streak (June 13-17). Retry after order manager rejection.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-23", opponent: "DET", side: "NO" as const, amount: 10.0, odds: 0.3243, payout: 20.833332, result: "LOSS" as const, profit: -10.0, note: "3-game losing streak (L vs CIN x2, L vs DET G1). Rule 4: NO $10 loss streak.", betPlaced: true, tweetId: "2069271772843712921", createdAt: new Date().toISOString() },
  { date: "2026-06-25", opponent: "BOS", side: "YES" as const, amount: 10.0, odds: 0.375, payout: 16.666665, result: "LOSS" as const, profit: -10.0, note: "2+ win streak (W2)", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-26", opponent: "BOS", side: "NO" as const, amount: 10.0, odds: 0.3289, payout: 20.408162, result: "WIN" as const, profit: 10.41, note: "Rule 5: Game 2 of series, BOS leads 1-0 (won Game 82 6-3 June 25). NO $10 series deficit. BOS won 6-1 (Tolle 7IP 1H 7K, Contreras 3 RBI). NO bet hit.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-06-27", opponent: "BOS", side: "NO" as const, amount: 10.0, odds: 0.3197, payout: 21.276594, result: "WIN" as const, profit: 11.28, note: "Rule 5: series deficit — BOS leads series 2-0, this is Game 3. BOS won 4-1 (Jake Bennett W 2-3, 6.1IP; Cole L 2-3; Yoshida HR, Contreras 2-RBI 2B, Seigler 1st MLB HR). NO bet hit.", betPlaced: true, tweetId: "2070721173407637738", createdAt: new Date().toISOString() },
  { date: "2026-06-28", opponent: "BOS", side: "NO" as const, amount: 10.0, odds: 0.3464, payout: 18.867923, result: "WIN" as const, profit: 8.87, note: "Rule 4: 3-game loss streak (L June 25, 26, 27 vs BOS). Also Rule 5: BOS leads series 3-0, Game 4.", betPlaced: true, tweetId: "2071083360286335061", createdAt: new Date().toISOString() },
  { date: "2026-06-29", opponent: "DET", side: "NO" as const, amount: 10.0, odds: 0.3056, payout: 22.727271, result: "WIN" as const, profit: 12.73, note: "Rule 4: 4-game loss streak (L June 25, 26, 27, 28). NO bet on Yankees, betting DET to win.", betPlaced: true, tweetId: "2071600055446835424", createdAt: new Date().toISOString() },
  { date: "2026-06-30", opponent: "DET", side: "NO" as const, amount: 10, odds: 0.3075, payout: 22.522521, result: "WIN" as const, profit: 12.52, note: "Rule 4: 9-game loss streak. Betting DET wins.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-07-01", opponent: "DET", side: "NO" as const, amount: 10.0, odds: 0.3056, payout: 22.727271, result: "WIN" as const, profit: 12.73, note: "Rule 4: 6-game loss streak (L June 25-30). Also Rule 5: DET leads series 2-0, Game 3. Tigers 6, Yankees 2 (11 inn.) — DET swept series. NO bet hit.", betPlaced: true, tweetId: "2072170081396699420", createdAt: new Date().toISOString() },
  { date: "2026-07-03", opponent: "MIN", side: "NO" as const, amount: 10.0, odds: 0.2806, payout: 25.641024, result: "LOSS" as const, profit: -10.0, note: "Rule 4: 7-game loss streak (L June 25 - July 1). Yankees 48-38, betting MIN to win.", betPlaced: true, tweetId: "2073256709397647515", createdAt: new Date().toISOString() },
  { date: "2026-07-11", opponent: "WAS", side: "YES" as const, amount: 15.0, odds: 0.3902, payout: 23.4375, result: "WIN" as const, profit: 8.44, note: "2-game win streak (W July 9 vs TBR 12-4, W July 10 vs WAS 5-3) + Game 2 of series (Yankees lead 1-0 vs WAS). Rule 1: high-confidence YES $15.", betPlaced: true, tweetId: "2075911055579009085", createdAt: new Date().toISOString() },
  { date: "2026-07-12", opponent: "WAS", side: "YES" as const, amount: 15.0, odds: 0.3377, payout: 29.411763, result: "WIN" as const, profit: 14.41, note: "Rule 1: 3-game win streak + Game 3 of series Yankees lead 2-0 (high-confidence YES $15)", betPlaced: true, tweetId: "2076155960494604736", createdAt: new Date().toISOString() },
  { date: "2026-07-17", opponent: "LAD", side: "YES" as const, amount: 10.0, odds: 0.3197, payout: 21.276594, result: "LOSS" as const, profit: -10.0, note: "Rule 2: 4-game win streak going into All-Star break (W July 9-12). Game 1 of LAD series.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-07-18", opponent: "LAD", side: "YES" as const, amount: 10.0, odds: 0.3333, payout: 20.0, result: "LOSS" as const, profit: -10.0, note: "Bounce-back rule: lost exactly 1 (July 17 vs LAD) after 4-game win streak (July 9-12). YES $10. | GAME POSTPONED (rain). Rescheduled as DH Game 1 on July 19. Market mlb-lad-nyy-2026-07-18 remains open per postponement rules. | Game played July 19 DH Game 1: LAD 8, NYY 2. Yamamoto CG (9IP, 4H, 7K). Result: LOSS.", betPlaced: true, tweetId: "2078330313609023792", createdAt: new Date().toISOString() },
  { date: "2026-07-19", opponent: "LAD", side: "NO" as const, amount: 10.0, odds: 0.3464, payout: 18.867923, result: "LOSS" as const, profit: -10.0, note: "Rule 5: series deficit — LAD leads series 2-0 (W July 17 + W DH Game 1, Yamamoto CG). This is Game 3. Bet NO (LAD win token). Re-evaluated post Game 1 result after midnight cron unwind.", betPlaced: true, tweetId: "2078935493002035514", createdAt: new Date().toISOString() },
  { date: "2026-07-21", opponent: "PIT", side: "YES" as const, amount: 15.0, odds: 0.3671, payout: 25.862066, result: null, profit: 0, note: "Rule 1: 2-game win streak (W July 19 DH G2 + W July 20 vs PIT 8-5) + Game 2 of series Yankees lead 1-0. High-confidence YES $15. | GAME POSTPONED — Rain (July 21, 2026). Rescheduled as DH July 22. Market likely voided/refunded.", betPlaced: true, tweetId: null, createdAt: new Date().toISOString() },
  { date: "2026-07-22", opponent: "PIT", side: "YES" as const, amount: 15.0, odds: 0.3711, payout: 25.423726, result: "LOSS" as const, profit: -15.0, note: "Rule 1: 2-game win streak (W July 19 DH G2 + W July 20 vs PIT 8-5) + Game 2 of series Yankees lead 1-0. High-confidence YES $15.", betPlaced: true, tweetId: "2079779953848074722", createdAt: new Date().toISOString() },
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

  // Always upsert so result/profit corrections in SEED_BETS propagate to the DB.
  {
    await db
      .insert(yankeesBets)
      .values(SEED_BETS)
      .onConflictDoUpdate({
        target: yankeesBets.date,
        set: {
          opponent: sql`excluded.opponent`,
          side: sql`excluded.side`,
          amount: sql`excluded.amount`,
          odds: sql`excluded.odds`,
          result: sql`excluded.result`,
          profit: sql`excluded.profit`,
          payout: sql`excluded.payout`,
          note: sql`excluded.note`,
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
