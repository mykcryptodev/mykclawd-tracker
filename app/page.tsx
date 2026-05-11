import { AppSidebar } from "@/components/app-sidebar";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { PnlChart } from "@/components/pnl-chart";
import { AllocationChart } from "@/components/allocation-chart";
import { TokenTable } from "@/components/token-table";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

async function getPnlData() {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/pnl`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
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
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
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
                <Card>
                  <CardHeader>
                    <CardTitle>Positions</CardTitle>
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
