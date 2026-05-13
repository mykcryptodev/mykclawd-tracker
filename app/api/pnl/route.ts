import { NextResponse } from "next/server";
import {
  getCurrentPositions,
  getDailySnapshotSeries,
} from "../../../lib/pnl/snapshot";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const [
    { positions, totalValueUsd, totalRealizedUsd, totalUnrealizedUsd },
    series,
  ] = await Promise.all([
    getCurrentPositions(today),
    getDailySnapshotSeries(),
  ]);

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
