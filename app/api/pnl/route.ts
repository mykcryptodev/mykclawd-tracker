import { NextResponse } from "next/server";
import { runMigrations } from "../../../db/migrate";
import { getCurrentPositions } from "../../../lib/pnl/snapshot";
import { db } from "../../../db/client";
import { dailySnapshots } from "../../../db/schema";

export async function GET() {
  runMigrations();

  const today = new Date().toISOString().slice(0, 10);
  const { positions, totalValueUsd, totalRealizedUsd, totalUnrealizedUsd } =
    getCurrentPositions(today);

  const series = db
    .select()
    .from(dailySnapshots)
    .all()
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    asOf: today,
    trackedAddress:
      process.env.TRACKED_ADDRESS ??
      "0xcef6e6639e0c60d5c0805670f4363a6698081fab",
    totalValueUsd,
    totalRealizedUsd,
    totalUnrealizedUsd,
    byToken: positions,
    dailySeries: series,
  });
}
