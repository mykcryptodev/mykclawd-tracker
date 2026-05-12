import { AppSidebar } from "@/components/app-sidebar";
import { HomeLanding, type HomePnlSnapshot } from "@/components/home-landing";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

async function getPnlSnapshot(): Promise<HomePnlSnapshot | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/pnl`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      asOf: data?.asOf ?? "—",
      totalValueUsd: data?.totalValueUsd ?? 0,
      totalRealizedUsd: data?.totalRealizedUsd ?? 0,
      totalUnrealizedUsd: data?.totalUnrealizedUsd ?? 0,
      byToken: (data?.byToken ?? []).map((p: { symbol: string; valueUsd: number }) => ({
        symbol: p.symbol,
        valueUsd: p.valueUsd,
      })),
    };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const pnl = await getPnlSnapshot();

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
        <SiteHeader variant="minimal" title="myk_clawd" />
        <HomeLanding pnl={pnl} />
      </SidebarInset>
    </SidebarProvider>
  );
}
