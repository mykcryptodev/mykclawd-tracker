// LP health monitor — evaluate exit/warning conditions after each snapshot
// and send Telegram alerts when thresholds are breached.
//
// Exit thresholds (act immediately):
//   HARD_EXIT_NET_BENEFIT_PCT   < -5%    net benefit (AERO - IL) as % of start capital
//   HARD_EXIT_COVERAGE_RATIO    < 0.30   AERO covering <30% of LP drag
//   HARD_EXIT_LP_DELTA_PCT      < -15%   raw LP-only loss as % of start capital
//                                        (only when net benefit is negative — deep IL fully
//                                         covered by AERO rewards is ratio movement, not loss)
//   HARD_EXIT_APR               < -20%   annualised strategy return deeply negative
//
// Warning thresholds (actionable only — myk 2026-08-17: no alerts unless there's
// something to act on):
//   OUT OF RANGE                every live position's curTick outside [tickLower, tickUpper)
//                               — earning zero fees, action = rebalance or exit.
//                               Checked on-chain from the snapshot's own tick data.
//                               (Replaces the old USD-velocity WARN, which fired on AERO
//                               price dips and claimed "may be out of range" — pure noise.)
//
// Alert cooldown: max 1 alert per 4 hours per severity level (stored in aero_config).

import { db } from "../../db/client";
import { aeroConfig } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { AeroSnapshot } from "./snapshot";

// ─── thresholds ───────────────────────────────────────────────────────────────
const HARD_EXIT_NET_BENEFIT_PCT  = -5;
const HARD_EXIT_COVERAGE_RATIO   = 0.30;
const HARD_EXIT_LP_DELTA_PCT     = -15;
const HARD_EXIT_APR              = -20;
const ALERT_COOLDOWN_S           = 4 * 3600;  // 4 hours

// ─── types ────────────────────────────────────────────────────────────────────
export type AlertLevel = "EXIT" | "WARN" | "OK";

export interface MonitorResult {
  level: AlertLevel;
  reasons: string[];
  sent: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
async function getConfigTs(key: string): Promise<number> {
  const row = await db.select().from(aeroConfig).where(eq(aeroConfig.key, key)).get();
  return row ? Number(row.value) : 0;
}

async function setConfigTs(key: string, ts: number) {
  await db.insert(aeroConfig)
    .values({ key, value: String(ts) })
    .onConflictDoUpdate({ target: aeroConfig.key, set: { value: String(ts) } })
    .run();
}

function usd(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function pct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// Discord webhook — one env var, no bot token/chat ids to manage.
// Set DISCORD_WEBHOOK_URL (repo secret) to a webhook for the channel that should
// receive LP alerts. Discord messages cap at 2000 chars; our alerts are ~600.
async function sendDiscord(text: string): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  // Convert the small HTML subset we use to Discord markdown.
  const md = text
    .replace(/<b>(.*?)<\/b>/g, "**$1**")
    .replace(/<[^>]+>/g, "");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: md.slice(0, 1990) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── main evaluator ───────────────────────────────────────────────────────────
export async function evaluateAndAlert(s: AeroSnapshot): Promise<MonitorResult> {
  const { health, usd: u } = s;
  const reasons: string[] = [];
  let level: AlertLevel = "OK";

  // ── hard exit checks ──
  if (health.netBenefitPct < HARD_EXIT_NET_BENEFIT_PCT) {
    level = "EXIT";
    reasons.push(
      `Net benefit ${pct(health.netBenefitPct)} is below hard-exit threshold of ${HARD_EXIT_NET_BENEFIT_PCT}% — AERO rewards no longer covering IL`
    );
  }

  if (health.coverageRatio < HARD_EXIT_COVERAGE_RATIO) {
    level = "EXIT";
    reasons.push(
      `Coverage ratio ${health.coverageRatio.toFixed(2)}x — AERO rewards covering only ${(health.coverageRatio * 100).toFixed(0)}% of LP drag (threshold: ${(HARD_EXIT_COVERAGE_RATIO * 100).toFixed(0)}%)`
    );
  }

  // Deep IL only warrants EXIT when rewards aren't covering it. Firing on raw
  // IL alone false-positives on any LP in a trending market that is net profitable.
  const lpDeltaPct = u.startUsd > 0 ? (u.lpOnlyDelta / u.startUsd) * 100 : 0;
  if (lpDeltaPct < HARD_EXIT_LP_DELTA_PCT && health.netBenefitUsd < 0) {
    level = "EXIT";
    reasons.push(
      `LP-only delta ${pct(lpDeltaPct)} with negative net benefit (${usd(health.netBenefitUsd)}) — uncompensated impermanent loss exceeds ${HARD_EXIT_LP_DELTA_PCT}% of start capital`
    );
  }

  if (u.apr < HARD_EXIT_APR) {
    level = "EXIT";
    reasons.push(`Annualised APR ${pct(u.apr)} is deeply negative (threshold: ${HARD_EXIT_APR}%)`);
  }

  // ── warning checks (only if not already EXIT) ──
  // Single WARN condition: the position is definitively out of range, verified
  // from on-chain tick data already in the snapshot. Earning zero fees — the
  // action is rebalance or exit. Soft "deterioration" WARNs were removed
  // (2026-08-17): they alerted without an action to take.
  if (level !== "EXIT") {
    const live = s.positions.filter((p) => BigInt(p.liquidity) > 0n);
    if (
      live.length > 0 &&
      live.every((p) => p.curTick < p.tickLower || p.curTick >= p.tickUpper)
    ) {
      level = "WARN";
      reasons.push(
        "Position is OUT OF RANGE (current tick outside all live positions' bounds) — earning zero fees. Rebalance or exit."
      );
    }
  }

  if (level === "OK") return { level, reasons: [], sent: false };

  // ── cooldown check ──
  const cooldownKey = `last_alert_${level.toLowerCase()}`;
  const lastAlertTs = await getConfigTs(cooldownKey);
  const now = Math.floor(Date.now() / 1000);
  if (now - lastAlertTs < ALERT_COOLDOWN_S) {
    return { level, reasons, sent: false }; // within cooldown, skip
  }

  // ── compose message ──
  const emoji = level === "EXIT" ? "🚨" : "⚠️";
  const header = level === "EXIT"
    ? `${emoji} <b>AERODROME LP — EXIT SIGNAL</b>`
    : `${emoji} <b>Aerodrome LP — Warning</b>`;

  const lines = [
    header,
    "",
    ...reasons.map((r) => `• ${r}`),
    "",
    `<b>Snapshot summary</b>`,
    `Strategy: <b>$${u.stratUsd.toFixed(2)}</b> vs HODL $${u.hodlUsd.toFixed(2)} (Δ ${usd(u.deltaUsd)})`,
    `Net benefit: <b>${usd(health.netBenefitUsd)}</b> (${pct(health.netBenefitPct)})`,
    `Coverage: <b>${health.coverageRatio === 99 ? "∞" : health.coverageRatio.toFixed(2)}x</b>`,
    `APR: <b>${pct(u.apr)}</b>`,
    `AERO rewards: $${u.aeroAddedUsd.toFixed(2)} | LP drag: ${usd(u.lpOnlyDelta)}`,
  ];

  if (level === "EXIT") {
    lines.push("", "👉 Consider exiting LP and holding assets directly.");
  }

  const sent = await sendDiscord(lines.join("\n"));
  if (sent) await setConfigTs(cooldownKey, now);

  return { level, reasons, sent };
}
