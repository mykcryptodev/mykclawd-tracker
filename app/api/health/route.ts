import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { syncState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runMigrations } from "@/db/migrate";

export const dynamic = "force-dynamic";

const HEALTH_SNAPSHOT_KEY = "health_snapshot";

export async function GET() {
  try {
    await runMigrations();
    const row = await db
      .select()
      .from(syncState)
      .where(eq(syncState.key, HEALTH_SNAPSHOT_KEY))
      .get();

    if (!row) {
      return NextResponse.json({ error: "no data yet" }, { status: 404 });
    }

    return NextResponse.json(JSON.parse(row.value));
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
