import { db, client } from "@/db/client";
import { bountyJobs } from "@/db/schema";

interface JobInput {
  id: string;
  listingId: string;
  title: string;
  reward?: number | null;
  rewardToken?: string | null;
  deadline?: string | null;
  type?: string;
  status?: string;
  cursorRunId?: string | null;
  prUrl?: string | null;
  repoUrl?: string | null;
  submissionId?: string | null;
  errorMessage?: string | null;
  discoveredAt: string;
  submittedAt?: string | null;
  updatedAt: string;
  otherInfo?: string | null;
}

export async function POST(req: Request) {
  // Auth check
  const token = req.headers.get("x-sync-token");
  const syncToken = process.env.SYNC_TOKEN;
  if (syncToken && token !== syncToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobs: JobInput[];
  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return Response.json({ error: "Body must be an array of jobs" }, { status: 400 });
    }
    jobs = body as JobInput[];
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (jobs.length === 0) {
    return Response.json({ synced: 0 });
  }

  // Ensure table exists (best-effort; migration should be run separately)
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS bounty_jobs (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        title TEXT NOT NULL,
        reward REAL,
        reward_token TEXT,
        deadline TEXT,
        type TEXT NOT NULL DEFAULT 'bounty',
        status TEXT NOT NULL DEFAULT 'discovered',
        cursor_run_id TEXT,
        pr_url TEXT,
        repo_url TEXT,
        submission_id TEXT,
        error_message TEXT,
        discovered_at TEXT NOT NULL,
        submitted_at TEXT,
        updated_at TEXT NOT NULL,
        other_info TEXT
      )
    `);
  } catch {
    // Table likely already exists
  }

  let synced = 0;
  for (const job of jobs) {
    try {
      await db
        .insert(bountyJobs)
        .values({
          id: job.id,
          listingId: job.listingId,
          title: job.title,
          reward: job.reward ?? null,
          rewardToken: job.rewardToken ?? null,
          deadline: job.deadline ?? null,
          type: job.type ?? "bounty",
          status: job.status ?? "discovered",
          cursorRunId: job.cursorRunId ?? null,
          prUrl: job.prUrl ?? null,
          repoUrl: job.repoUrl ?? null,
          submissionId: job.submissionId ?? null,
          errorMessage: job.errorMessage ?? null,
          discoveredAt: job.discoveredAt,
          submittedAt: job.submittedAt ?? null,
          updatedAt: job.updatedAt,
          otherInfo: job.otherInfo ?? null,
        })
        .onConflictDoUpdate({
          target: bountyJobs.id,
          set: {
            listingId: job.listingId,
            title: job.title,
            reward: job.reward ?? null,
            rewardToken: job.rewardToken ?? null,
            deadline: job.deadline ?? null,
            type: job.type ?? "bounty",
            status: job.status ?? "discovered",
            cursorRunId: job.cursorRunId ?? null,
            prUrl: job.prUrl ?? null,
            repoUrl: job.repoUrl ?? null,
            submissionId: job.submissionId ?? null,
            errorMessage: job.errorMessage ?? null,
            submittedAt: job.submittedAt ?? null,
            updatedAt: job.updatedAt,
            otherInfo: job.otherInfo ?? null,
          },
        });
      synced++;
    } catch (err) {
      console.error(`Failed to upsert bounty job ${job.id}:`, err);
    }
  }

  return Response.json({ synced });
}
