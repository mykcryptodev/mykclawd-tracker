// Returns the current status of a GitHub Actions run + its jobs.
// Clients poll this every ~4 seconds while a sync is in progress.

import { NextResponse } from "next/server";

const OWNER = "mykcryptodev";
const REPO  = "mykclawd-tracker";

export interface JobStatus {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null; // "success" | "failure" | "cancelled" | null
  startedAt: string | null;
  completedAt: string | null;
}

export interface RunStatus {
  runId: number;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  jobs: JobStatus[];
  htmlUrl: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GH_DISPATCH_TOKEN not configured" }, { status: 500 });
  }

  const { runId } = await params;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const [runRes, jobsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}`, { headers }),
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs`, { headers }),
  ]);

  if (!runRes.ok) {
    return NextResponse.json({ error: `Run not found: ${runId}` }, { status: 404 });
  }

  const run = await runRes.json() as {
    id: number;
    status: string;
    conclusion: string | null;
    html_url: string;
  };

  const jobsData = jobsRes.ok
    ? (await jobsRes.json() as { jobs: Array<{ name: string; status: string; conclusion: string | null; started_at: string | null; completed_at: string | null }> })
    : { jobs: [] };

  const result: RunStatus = {
    runId: run.id,
    status: run.status as RunStatus["status"],
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    jobs: jobsData.jobs.map((j) => ({
      name: j.name,
      status: j.status as JobStatus["status"],
      conclusion: j.conclusion,
      startedAt: j.started_at,
      completedAt: j.completed_at,
    })),
  };

  return NextResponse.json(result);
}
