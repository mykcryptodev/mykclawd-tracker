import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { quotientPositions, quotientSync } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { desc, eq } from "drizzle-orm";

let migrated = false;

export async function GET() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  const positions = await db
    .select()
    .from(quotientPositions)
    .orderBy(desc(quotientPositions.enteredAt));

  const syncRows = await db
    .select()
    .from(quotientSync)
    .where(eq(quotientSync.id, 1));

  return NextResponse.json({
    positions,
    sync: syncRows[0] ?? null,
  });
}
