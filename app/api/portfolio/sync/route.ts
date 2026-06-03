// On-demand portfolio NAV refresh. Uses Next.js `after()` to run the sync
// *after* the response is returned — so the user can close the tab immediately
// after tapping Sync and the work continues server-side.
// Rate-limited to avoid hammering Zerion; the 6h GH Actions cron is the primary path.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { runMigrations } from "../../../../db/migrate";
import { db } from "../../../../db/client";
import { portfolioSync } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { syncPortfolioNav } from "../../../../lib/portfolio/sync";

export const maxDuration = 120; // orders fetch (Bankr agent API) can take ~30s
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

    // Fire the sync after the response is sent — safe to close the browser.
    after(async () => {
      try {
        await syncPortfolioNav();
      } catch (e) {
        console.error("[portfolio/sync] background sync error:", e);
      }
    });

    return NextResponse.json({ ok: true, background: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
