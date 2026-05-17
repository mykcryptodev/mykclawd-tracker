import { NextRequest, NextResponse } from "next/server";
import { runMigrations } from "../../../db/migrate";
import { db } from "../../../db/client";
import { aeroSnapshots } from "../../../db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  await runMigrations();

  const rawAddress = req.nextUrl.searchParams.get("address");
  const address = rawAddress?.toLowerCase() ?? "0xf142022273602c6a6c0ea7a044d21082273bd686";

  const snapshots = await db.select().from(aeroSnapshots)
    .where(eq(aeroSnapshots.address, address))
    .orderBy(desc(aeroSnapshots.ts)).all();
  if (snapshots.length === 0) {
    return NextResponse.json({ latest: null, history: [] });
  }

  const latest = snapshots[0];
  // Trend chart wants oldest→newest with just the essentials
  const history = [...snapshots].reverse().map((s) => ({
    ts: s.ts,
    stratUsd: s.stratUsd,
    hodlUsd: s.hodlUsd,
    deltaUsd: s.deltaUsd,
    aero: s.walletAero + s.pendingAero,
  }));

  const positions = JSON.parse(latest.positionsJson) as Array<Record<string, unknown>>;
  const inflows = JSON.parse(latest.inflowsJson) as Array<Record<string, unknown>>;

  return NextResponse.json({
    latest: {
      ts: latest.ts,
      address: latest.address,
      pool: latest.pool,
      gauge: latest.gauge,
      sym0: latest.sym0,
      sym1: latest.sym1,
      dec0: latest.dec0,
      dec1: latest.dec1,
      firstTs: latest.firstTs,
      lastTs: latest.lastTs,
      days: latest.days,
      prices: {
        p0Now: latest.p0Now, p1Now: latest.p1Now, paNow: latest.paNow,
        p0Start: latest.p0Start, p1Start: latest.p1Start, paStart: latest.paStart,
      },
      start: { eth: latest.startEth, t0: latest.startT0, t1: latest.startT1, aero: latest.startAero },
      inflows: { t0: latest.extInflowT0, t1: latest.extInflowT1, list: inflows },
      end: {
        walletEth: latest.walletEth, walletT0: latest.walletT0, walletT1: latest.walletT1, walletAero: latest.walletAero,
        positionT0: latest.positionT0, positionT1: latest.positionT1, pendingAero: latest.pendingAero,
      },
      usd: {
        startUsd: latest.startUsd, hodlUsd: latest.hodlUsd, stratUsd: latest.stratUsd,
        deltaUsd: latest.deltaUsd, lpOnlyDelta: latest.lpOnlyDeltaUsd, aeroAddedUsd: latest.aeroAddedUsd,
        deltaPct: latest.deltaPct, apr: latest.apr,
        totalGasEth: latest.totalGasEth, totalGasUsd: latest.totalGasUsd,
      },
      txCount: latest.txCount,
      gasTxsCounted: latest.gasTxsCounted,
      positions,
    },
    history,
  });
}
