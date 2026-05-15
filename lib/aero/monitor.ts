// LP health monitor — evaluate exit/warning conditions after each snapshot
// and send Telegram alerts when thresholds are breached.
//
// Exit thresholds (act immediately):
//   HARD_EXIT_NET_BENEFIT_PCT   < -5%    net benefit (AERO - IL) as % of start capital
//   HARD_EXIT_COVERAGE_RATIO    < 0.30   AERO covering <30% of LP drag
//   HARD_EXIT_LP_DELTA_PCT      < -15%   raw LP-only loss as % of start capital
//   HARD_EXIT_APR               < -20%   annualised strategy return deeply negative
//
// Warning thresholds (watch, alert — don't act yet):
//   WARN_COVERAGE_RATIO         < 0.70   sustained for ≥ WARN_CONSECUTIVE snapshots
//   WARN_AERO_VELOCITY_DROP     < 50%    of prior snapshot's velocity (earning nothing)
//   WARN_NET_BENEFIT_PCT        < -2%    early deterioration signal
//
// Alert cooldown: max 1 alert per 4 hours per severity level (stored in aero_config).

import { db } from "../../db/client";
import { aeroConfig, aeroSnapshots } from "../../db/schema";
import { desc, eq } from "drizzle-orm";
import type { AeroSnapshot } from "./snapshot";

// ─── thresholds ───────────────────────────────────────────────────────────────
const HARD_EXIT_NET_BENEFIT_PCT  = -5;
const HARD_EXIT_COVERAGE_RATIO   = 0.30;
const HARD_EXIT_LP_DELTA_PCT     = -15;
const HARD_EXIT_APR              = -20;
const WARN_COVERAGE_RATIO        = 0.70;
const WARN_CONSECUTIVE           = 3;
const WARN_NET_BENEFIT_PCT       = -2;
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

async function sendTelegram(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const threadId = process.env.TELEGRAM_TOPIC_ID; // optional thread/forum topic

  if (!token || !chatId) return false;

  const body: Record<string, string | number> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (threadId) body.message_thread_id = Number(threadId);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── consecutive low coverage check ──────────────────────────────────────────
async function consecutiveLowCoverage(threshold: number, n: number): Promise<number> {
  const rows = await db.select({ coverageRatio: aeroSnapshots.coverageRatio })
    .from(aeroSnapshots)
    .orderBy(desc(aeroSnapshots.ts))
    .limit(n)
    .all();
  let count = 0;
  for (const r of rows) {
    if ((r.coverageRatio ?? 1) < threshold) count++;
    else break;
  }
  return count;
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

  const lpDeltaPct = u.startUsd > 0 ? (u.lpOnlyDelta / u.startUsd) * 100 : 0;
  if (lpDeltaPct < HARD_EXIT_LP_DELTA_PCT) {
    level = "EXIT";
    reasons.push(
      `LP-only delta ${pct(lpDeltaPct)} — raw impermanent loss exceeds ${HARD_EXIT_LP_DELTA_PCT}% of start capital`
    );
  }

  if (u.apr < HARD_EXIT_APR) {
    level = "EXIT";
    reasons.push(`Annualised APR ${pct(u.apr)} is deeply negative (threshold: ${HARD_EXIT_APR}%)`);
  }

  // ── warning checks (only if not already EXIT) ──
  if (level !== "EXIT") {
    if (health.netBenefitPct < WARN_NET_BENEFIT_PCT) {
      level = "WARN";
      reasons.push(`Net benefit ${pct(health.netBenefitPct)} — early deterioration signal (threshold: ${WARN_NET_BENEFIT_PCT}%)`);
    }

    const consec = await consecutiveLowCoverage(WARN_COVERAGE_RATIO, WARN_CONSECUTIVE);
    if (consec >= WARN_CONSECUTIVE) {
      level = "WARN";
      reasons.push(
        `Coverage ratio below ${WARN_COVERAGE_RATIO}x for ${consec} consecutive snapshots — rewards not keeping up with drag`
      );
    }

    // AERO velocity drop: only if we have a prior data point
    if (
      health.aeroVelocityPerHr !== null &&
      health.aeroVelocityPerHr < 0
    ) {
      level = "WARN";
      reasons.push(
        `AERO velocity is negative (${usd(health.aeroVelocityPerHr)}/hr) — position may be out of range`
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

  const sent = await sendTelegram(lines.join("\n"));
  if (sent) await setConfigTs(cooldownKey, now);

  return { level, reasons, sent };
}
