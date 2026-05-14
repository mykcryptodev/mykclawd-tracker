import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { syncState } from "@/db/schema";
import { runMigrations } from "@/db/migrate";

export const dynamic = "force-dynamic";

const HEALTH_SNAPSHOT_KEY = "health_snapshot";

export async function POST(req: NextRequest) {
  const secret = process.env.HEALTH_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await runMigrations();
  await db
    .insert(syncState)
    .values({ key: HEALTH_SNAPSHOT_KEY, value: JSON.stringify(body) })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value: JSON.stringify(body) },
    })
    .run();

  return NextResponse.json({ ok: true });
}
