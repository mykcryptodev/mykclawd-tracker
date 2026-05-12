import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { AeroSummaryCards } from "@/components/aero/aero-summary-cards";
import { AeroTrendChart, AeroCompositionChart, AeroVsHodlChart, AeroWaterfallChart } from "@/components/aero/aero-charts";
import { AeroPositionCard } from "@/components/aero/aero-position-card";
import { AeroInflowsTable } from "@/components/aero/aero-inflows-table";
import type { AeroPayload } from "@/components/aero/aero-types";

async function getAeroData(): Promise<AeroPayload | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/aero`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AeroPage() {
  const data = await getAeroData();
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
          asOf={latest ? new Date(latest.ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8">
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

                  <div className="px-4 lg:px-6">
                    <AeroTrendChart history={history} />
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
                    Window: {new Date(latest.firstTs * 1000).toISOString().slice(0, 16).replace("T", " ")} → {new Date(latest.lastTs * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC ({latest.days.toFixed(2)} days)
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
