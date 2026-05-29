import { NextResponse } from "next/server";
import { getPortfolioOverview } from "../../../lib/portfolio/read";

export const dynamic = "force-dynamic";

export async function GET() {
  const { meta, totalValueUsd, navExEthUsd, series, positions, deltas } =
    await getPortfolioOverview();

  return NextResponse.json({
    trackedAddress:
      process.env.TRACKED_ADDRESS ?? "0xcef6e6639e0c60d5c0805670f4363a6698081fab",
    syncedAt: meta?.syncedAt ?? null,
    totalValueUsd, // includes native ETH
    navExEthUsd, // chart/deltas basis (excludes native ETH)
    deltas,
    navSeries: series,
    positions,
  });
}
