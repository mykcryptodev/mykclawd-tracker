import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { NavCards } from "@/components/portfolio/nav-cards";
import { NavChart } from "@/components/portfolio/nav-chart";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PortfolioSyncButton } from "@/components/portfolio/portfolio-sync-button";
import { EthBalanceCard } from "@/components/portfolio/eth-balance-card";
import { AllocationChart } from "@/components/allocation-chart";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortfolioOverview } from "@/lib/portfolio/read";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio",
};

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ?? "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

export default async function PortfolioPage() {
  const overview = await getPortfolioOverview().catch(() => null);

  const totalUsd = overview?.totalUsd ?? 0;
  const series = overview?.series ?? [];
  const positions = overview?.positions ?? [];
  const deltas = overview?.deltas ?? { d1: null, d7: null, d30: null };
  const syncedAt = overview?.meta?.syncedAt ?? null;
  const nativeEthBalance = overview?.meta?.nativeEthBalance ?? 0;
  const nativeEthUsd = overview?.meta?.nativeEthUsd ?? 0;

  const allocation = positions.map((p) => ({
    symbol: p.symbol || p.tokenAddress.slice(0, 6),
    valueUsd: p.balanceUsd,
  }));

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
        <SiteHeader
          address={TRACKED_ADDRESS}
          asOfTs={syncedAt}
          asOf={syncedAt ? undefined : "never synced"}
          title="Portfolio"
          syncSlot={<PortfolioSyncButton />}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8">
              <NavCards totalUsd={totalUsd} deltas={deltas} />
              <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
                <div className="lg:col-span-2">
                  <NavChart series={series} />
                </div>
                <div className="flex flex-col gap-4">
                  <AllocationChart positions={allocation} />
                  <EthBalanceCard balance={nativeEthBalance} usd={nativeEthUsd} />
                </div>
              </div>
              <div className="px-4 lg:px-6">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                      Holdings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <HoldingsTable positions={positions} trackedAddress={TRACKED_ADDRESS} />
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
