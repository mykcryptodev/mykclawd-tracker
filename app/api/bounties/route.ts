import { db } from "@/db/client";
import { bountyJobs } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const jobs = await db
      .select()
      .from(bountyJobs)
      .orderBy(desc(bountyJobs.discoveredAt))
      .all();

    return Response.json(jobs);
  } catch (err) {
    // Table may not exist yet — return empty array gracefully
    console.warn("bounty_jobs query failed (table may not exist yet):", err);
    return Response.json([]);
  }
}
