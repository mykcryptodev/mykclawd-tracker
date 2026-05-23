/**
 * Standalone migration: creates the bounty_jobs table if it doesn't exist.
 * Run with:  npx tsx db/migrate-bounties.ts
 */
import { client } from "./client";

async function migrateBounties() {
  console.log("Running bounty_jobs migration…");

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

  console.log("✓ bounty_jobs table ready");
}

migrateBounties()
  .then(() => {
    console.log("Migration complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
