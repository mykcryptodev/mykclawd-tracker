// Dispatch the GitHub Actions sync workflow and return the new run ID.
// Requires GH_DISPATCH_TOKEN env var with repo Actions write permission.
// Guard: will not dispatch if a snapshot was taken within the last hour.

import { NextResponse } from "next/server";
import { runMigrations } from "../../../db/migrate";
import { db } from "../../../db/client";
import { aeroSnapshots } from "../../../db/schema";
import { desc } from "drizzle-orm";

const OWNER = "mykcryptodev";
const REPO  = "mykclawd-tracker";
const WORKFLOW = "sync.yml";
const BRANCH = "main";

const MIN_SYNC_GAP_S = 60 * 60; // 1 hour

export async function POST() {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GH_DISPATCH_TOKEN not configured" }, { status: 500 });
  }

  // Guard: skip dispatch if a snapshot was taken within the last hour
  try {
    await runMigrations();
    const latest = await db.select({ ts: aeroSnapshots.ts })
      .from(aeroSnapshots)
      .orderBy(desc(aeroSnapshots.ts))
      .limit(1)
      .get();

    if (latest) {
      const ageS = Math.floor(Date.now() / 1000) - latest.ts;
      if (ageS < MIN_SYNC_GAP_S) {
        const waitMin = Math.ceil((MIN_SYNC_GAP_S - ageS) / 60);
        return NextResponse.json(
          { tooSoon: true, message: `Last sync was ${Math.floor(ageS / 60)}m ago — next available in ${waitMin}m` },
          { status: 429 }
        );
      }
    }
  } catch {
    // DB check failed — allow dispatch anyway
  }

  // 1. Grab the timestamp before dispatch so we can find the new run
  const beforeMs = Date.now();

  // 2. Dispatch the workflow
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
      body: JSON.stringify({ ref: BRANCH }),
    }
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return NextResponse.json({ error: `Dispatch failed: ${text}` }, { status: 502 });
  }

  // 3. Poll briefly to find the run that was just created (GH API lag ~1-3s)
  const deadline = Date.now() + 15_000;
  let runId: number | null = null;

  while (Date.now() < deadline && !runId) {
    await new Promise((r) => setTimeout(r, 2000));
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
    const data = await runsRes.json() as { workflow_runs: Array<{ id: number; created_at: string }> };
    const fresh = data.workflow_runs.find(
      (r) => new Date(r.created_at).getTime() >= beforeMs - 5000
    );
    if (fresh) runId = fresh.id;
  }

  if (!runId) {
    return NextResponse.json({ error: "Could not find new run — check Actions tab manually" }, { status: 504 });
  }

  return NextResponse.json({ runId });
}
