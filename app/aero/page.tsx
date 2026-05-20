import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { AeroSummaryCards } from "@/components/aero/aero-summary-cards";
import { AeroTrendChart, AeroDeltaChart, AeroCompositionChart, AeroVsHodlChart, AeroWaterfallChart } from "@/components/aero/aero-charts";
import { AeroPositionCard } from "@/components/aero/aero-position-card";
import { AeroInflowsTable } from "@/components/aero/aero-inflows-table";
import type { AeroInflow, AeroPayload, AeroPosition } from "@/components/aero/aero-types";
import { runMigrations } from "@/db/migrate";
import { db } from "@/db/client";
import { aeroSnapshots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { AeroAddressFilter } from "@/components/aero/aero-address-filter";
import { LocalDateTime } from "@/components/local-datetime";

export const dynamic = "force-dynamic";

const DEFAULT_ADDRESS = "0xf142022273602c6a6c0ea7a044d21082273bd686";

async function getAeroData(address: string): Promise<AeroPayload | null> {
  try {
    await runMigrations();
    const snapshots = await db.select().from(aeroSnapshots)
      .where(eq(aeroSnapshots.address, address))
      .orderBy(desc(aeroSnapshots.ts)).all();
    if (snapshots.length === 0) {
      return { latest: null, history: [] };
    }

    const latest = snapshots[0];
    const history = [...snapshots].reverse().map((s) => ({
      ts: s.ts,
      stratUsd: s.stratUsd,
      hodlUsd: s.hodlUsd,
      deltaUsd: s.deltaUsd,
      aero: s.walletAero + s.pendingAero,
    }));

    const positions = JSON.parse(latest.positionsJson) as AeroPosition[];
    const inflows = JSON.parse(latest.inflowsJson) as AeroInflow[];

    return {
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
          p0Now: latest.p0Now,
          p1Now: latest.p1Now,
          paNow: latest.paNow,
          p0Start: latest.p0Start,
          p1Start: latest.p1Start,
          paStart: latest.paStart,
        },
        start: { eth: latest.startEth, t0: latest.startT0, t1: latest.startT1, aero: latest.startAero },
        inflows: { t0: latest.extInflowT0, t1: latest.extInflowT1, list: inflows },
        end: {
          walletEth: latest.walletEth,
          walletT0: latest.walletT0,
          walletT1: latest.walletT1,
          walletAero: latest.walletAero,
          positionT0: latest.positionT0,
          positionT1: latest.positionT1,
          pendingAero: latest.pendingAero,
        },
        usd: {
          startUsd: latest.startUsd,
          hodlUsd: latest.hodlUsd,
          stratUsd: latest.stratUsd,
          deltaUsd: latest.deltaUsd,
          lpOnlyDelta: latest.lpOnlyDeltaUsd,
          aeroAddedUsd: latest.aeroAddedUsd,
          deltaPct: latest.deltaPct,
          apr: latest.apr,
          totalGasEth: latest.totalGasEth,
          totalGasUsd: latest.totalGasUsd,
        },
        health: {
          netBenefitUsd: latest.netBenefitUsd ?? 0,
          netBenefitPct: latest.netBenefitPct ?? 0,
          coverageRatio: latest.coverageRatio ?? 0,
          aeroVelocityPerHr: latest.aeroVelocityPerHr ?? null,
          lpDeltaVelocityPerHr: latest.lpDeltaVelocityPerHr ?? null,
        },
        txCount: latest.txCount,
        gasTxsCounted: latest.gasTxsCounted,
        positions,
      },
      history,
    };
  } catch {
    return null;
  }
}

export default async function AeroPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const params = await searchParams;
  const selectedAddress = (params.address ?? DEFAULT_ADDRESS).toLowerCase();
  const data = await getAeroData(selectedAddress);
  const latest = data?.latest ?? null;
  const history = data?.history ?? [];

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader
          address={latest?.address ?? ""}
          asOfTs={latest ? latest.ts : null}
          title="Aerodrome Rebalancer"
          titleHelpHref="https://x.com/myk_clawd/status/2052817777862328482"
          titleHelpLabel="Thread on Aerodrome LP (opens on X)"
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8">
              <div className="px-4 lg:px-6">
                <AeroAddressFilter selected={selectedAddress} />
              </div>
              {!latest ? (
                <div className="px-4 lg:px-6">
                  <Card className="border-border/60">
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      No Aerodrome snapshot yet. Click <strong>Sync</strong> in the header to populate.
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <>
                  <AeroSummaryCards latest={latest} />

                  <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
                    <AeroTrendChart history={history} />
                    <AeroDeltaChart history={history} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
                    <AeroCompositionChart latest={latest} />
                    <AeroVsHodlChart latest={latest} />
                  </div>

                  <div className="px-4 lg:px-6">
                    <AeroWaterfallChart latest={latest} />
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      AERO rewards added <strong className="text-green-600 dark:text-green-400">+${latest.usd.aeroAddedUsd.toFixed(2)}</strong>;
                      the LP itself produced <strong className={latest.usd.lpOnlyDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{latest.usd.lpOnlyDelta >= 0 ? "+" : ""}${latest.usd.lpOnlyDelta.toFixed(2)}</strong> relative
                      to holding the same tokens (impermanent loss + rebalance slippage).
                    </p>
                  </div>

                  <div className="px-4 lg:px-6">
                    <AeroPositionCard latest={latest} />
                  </div>

                  <div className="px-4 lg:px-6">
                    <AeroInflowsTable latest={latest} />
                  </div>

                  <div className="px-4 lg:px-6 text-xs text-muted-foreground leading-relaxed">
                    Window: <LocalDateTime ts={latest.firstTs} /> → <LocalDateTime ts={latest.lastTs} /> ({latest.days.toFixed(2)} days)
                    {" · "}Pool: <span className="font-mono">{latest.pool}</span>
                    {" · "}Gauge: <span className="font-mono">{latest.gauge}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
