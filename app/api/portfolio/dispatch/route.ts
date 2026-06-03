// Dispatch the GitHub Actions sync workflow for the portfolio job only.
// Returns immediately with a runId — the actual sync runs server-side on GH Actions.
// Closing the browser after tapping Sync is safe.

import { NextResponse } from "next/server";
import { db } from "../../../../db/client";
import { portfolioSync } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { runMigrations } from "../../../../db/migrate";

const OWNER = "mykcryptodev";
const REPO = "mykclawd-tracker";
const WORKFLOW = "sync.yml";
const BRANCH = "main";

const MIN_DISPATCH_GAP_S = 5 * 60; // 5 min — lighter than direct sync's 30min guard

export const dynamic = "force-dynamic";

export async function POST() {
  const token = process.env.GH_DISPATCH_TOKEN;

  // No token configured — tell client to fall back to direct sync
  if (!token) {
    return NextResponse.json({ error: "GH_DISPATCH_TOKEN not set", fallback: true }, { status: 503 });
  }

  // Rate-limit guard
  try {
    await runMigrations();
    const last = await db
      .select({ syncedAt: portfolioSync.syncedAt })
      .from(portfolioSync)
      .where(eq(portfolioSync.id, 1))
      .get();

    if (last) {
      const ageS = Math.floor(Date.now() / 1000) - last.syncedAt;
      if (ageS < MIN_DISPATCH_GAP_S) {
        const waitMin = Math.ceil((MIN_DISPATCH_GAP_S - ageS) / 60);
        return NextResponse.json(
          { tooSoon: true, message: `Synced ${Math.floor(ageS / 60)}m ago — next in ${waitMin}m` },
          { status: 429 }
        );
      }
    }
  } catch {
    // DB unavailable — allow dispatch
  }

  // Dispatch workflow_dispatch with jobs=portfolio
  const beforeMs = Date.now();
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: BRANCH, inputs: { jobs: "portfolio" } }),
    }
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return NextResponse.json({ error: `Dispatch failed: ${text.slice(0, 200)}` }, { status: 502 });
  }

  // Poll briefly (~15s) to get the run ID so the client can track status
  const deadline = Date.now() + 15_000;
  let runId: number | null = null;

  while (Date.now() < deadline && !runId) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const runsRes = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&per_page=5`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
      if (!runsRes.ok) continue;
      const data = await runsRes.json() as {
        workflow_runs: Array<{ id: number; created_at: string }>;
      };
      const fresh = data.workflow_runs.find(
        (r) => new Date(r.created_at).getTime() >= beforeMs - 5000
      );
      if (fresh) runId = fresh.id;
    } catch {
      // retry
    }
  }

  return NextResponse.json({ ok: true, runId });
}
