// On-demand portfolio NAV refresh. Fast enough (1–2 Zapper calls) to run inline in
// a serverless function. Rate-limited so the page's Sync button can't hammer the
// expensive Zapper API; the 6h GitHub Actions cron is the primary refresh path.

import { NextResponse } from "next/server";
import { runMigrations } from "../../../../db/migrate";
import { db } from "../../../../db/client";
import { portfolioSync } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { syncPortfolioNav } from "../../../../lib/portfolio/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MIN_SYNC_GAP_S = 30 * 60; // 30 minutes

export async function POST() {
  try {
    await runMigrations();

    const last = await db
      .select({ syncedAt: portfolioSync.syncedAt })
      .from(portfolioSync)
      .where(eq(portfolioSync.id, 1))
      .get();

    if (last) {
      const ageS = Math.floor(Date.now() / 1000) - last.syncedAt;
      if (ageS < MIN_SYNC_GAP_S) {
        const waitMin = Math.ceil((MIN_SYNC_GAP_S - ageS) / 60);
        return NextResponse.json(
          {
            tooSoon: true,
            message: `Synced ${Math.floor(ageS / 60)}m ago — next refresh available in ${waitMin}m`,
          },
          { status: 429 }
        );
      }
    }

    const result = await syncPortfolioNav();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
