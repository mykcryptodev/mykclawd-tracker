import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHatTaps, HAT_WALLET, MYK_ADDRESS } from "@/lib/hat-tap";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hat Tap",
};

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}

function fmt(usd: number) {
  return "$" + usd.toFixed(2);
}

export default async function HatPage() {
  const data = await fetchHatTaps();

  const asOf = new Date().toISOString().slice(0, 10);

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
        <SiteHeader asOf={asOf} title="Hat Tap" variant="minimal" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 px-4 lg:px-6">

              {/* About card */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    About
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    <span className="font-semibold text-foreground">Dept. of Agriculture</span> is a yield-bearing streetwear experiment.
                    Each hat is a staking mechanism — tap within the 10-minute Friday window to collect your weekly share of onchain rewards.
                  </p>
                  <p>
                    Rewards are distributed weekly from the hat&apos;s smart contract wallet via USDC on Base.
                  </p>
                  <div className="pt-1 space-y-1 font-mono text-xs">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Hat wallet</span>
                      <span className="truncate">{HAT_WALLET}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">Recipient</span>
                      <span className="truncate">{MYK_ADDRESS}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary stats */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Yield Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatRow label="Total earned" value={fmt(data.totalUsd)} />
                  <StatRow label="Taps collected" value={String(data.tapCount)} />
                  <StatRow label="Avg per tap" value={data.tapCount > 0 ? fmt(data.avgTapUsd) : "—"} />
                  <StatRow label="First tap" value={data.firstTapDate ?? "—"} />
                  <StatRow label="Last tap" value={data.lastTapDate ?? "—"} />
                  <StatRow label="Next expected" value={data.nextExpected ?? "—"} />
                </CardContent>
              </Card>

              {/* Transaction history */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Tap History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.taps.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No taps found yet. Make sure CDP_API_KEY is configured.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="px-6 py-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                            Date
                          </th>
                          <th className="px-6 py-2 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                            Amount
                          </th>
                          <th className="px-6 py-2 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium hidden md:table-cell">
                            Tx
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.taps].reverse().map((tap) => (
                          <tr
                            key={tap.txHash}
                            className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-6 py-3 font-mono text-xs">{tap.date}</td>
                            <td className="px-6 py-3 text-right font-mono text-xs font-semibold text-green-500">
                              +{fmt(tap.amount)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                              <a
                                href={`https://basescan.org/tx/${tap.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-foreground transition-colors"
                              >
                                {tap.txHash.slice(0, 8)}…{tap.txHash.slice(-6)}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border/40 bg-muted/20">
                          <td className="px-6 py-3 text-xs font-medium text-muted-foreground">
                            Total ({data.tapCount} taps)
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-sm font-bold text-green-500">
                            +{fmt(data.totalUsd)}
                          </td>
                          <td className="hidden md:table-cell" />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
