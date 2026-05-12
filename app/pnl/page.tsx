import { AppSidebar } from "@/components/app-sidebar";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { PnlChart } from "@/components/pnl-chart";
import { AllocationChart } from "@/components/allocation-chart";
import { TokenTable } from "@/components/token-table";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runMigrations } from "@/db/migrate";
import { db } from "@/db/client";
import { dailySnapshots } from "@/db/schema";
import { getCurrentPositions } from "@/lib/pnl/snapshot";

export const dynamic = "force-dynamic";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

async function getPnlData() {
  try {
    await runMigrations();
    const today = new Date().toISOString().slice(0, 10);
    const { positions, totalValueUsd, totalRealizedUsd, totalUnrealizedUsd } =
      await getCurrentPositions(today);
    const series = (await db.select().from(dailySnapshots).all()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      asOf: today,
      totalValueUsd,
      totalRealizedUsd,
      totalUnrealizedUsd,
      byToken: positions,
      dailySeries: series,
    };
  } catch {
    return null;
  }
}

export default async function PnlPage() {
  const data = await getPnlData();

  const totalValueUsd = data?.totalValueUsd ?? 0;
  const totalRealizedUsd = data?.totalRealizedUsd ?? 0;
  const totalUnrealizedUsd = data?.totalUnrealizedUsd ?? 0;
  const positions = data?.byToken ?? [];
  const series = data?.dailySeries ?? [];
  const asOf = data?.asOf ?? "—";

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader address={TRACKED_ADDRESS} asOf={asOf} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8">
              <SectionCards
                totalValueUsd={totalValueUsd}
                totalRealizedUsd={totalRealizedUsd}
                totalUnrealizedUsd={totalUnrealizedUsd}
              />
              <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
                <div className="lg:col-span-2">
                  <PnlChart series={series} />
                </div>
                <AllocationChart positions={positions} />
              </div>
              <div className="px-4 lg:px-6">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                      Positions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TokenTable positions={positions} trackedAddress={TRACKED_ADDRESS} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
