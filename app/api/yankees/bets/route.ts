import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { yankeesBets } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { desc } from "drizzle-orm";

let migrated = false;

export async function GET() {
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }

  const bets = await db
    .select()
    .from(yankeesBets)
    .orderBy(desc(yankeesBets.date));

  return NextResponse.json({ bets }, { headers: { "Cache-Control": "no-store" } });
}
