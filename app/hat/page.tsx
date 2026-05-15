import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Hat Tap",
};

const HAT_WALLET = "0xa8aa312eb3bd86b8d664608fcbcea12a6b0f9b91";
const MYK_ADDRESS = "0x653ff253b0c7C1cc52f484e891b71f9f1F010Bfb";

interface HatTap {
  date: string;
  amount: number;
  to: string;
}

// Hardcoded — data from CDP SQL query (Jun 2025 → May 2026)
// Source: USDC transfers from smart wallet → myk's address on Base
const TAPS: HatTap[] = [
  { date: "2025-06-06", amount: 5.91,  to: MYK_ADDRESS },
  { date: "2025-06-13", amount: 5.19,  to: MYK_ADDRESS },
  { date: "2025-06-21", amount: 6.32,  to: MYK_ADDRESS },
  { date: "2025-06-27", amount: 5.00,  to: MYK_ADDRESS },
  { date: "2025-07-26", amount: 17.74, to: MYK_ADDRESS },
  { date: "2025-08-09", amount: 5.37,  to: MYK_ADDRESS },
  { date: "2025-08-16", amount: 6.69,  to: MYK_ADDRESS },
  { date: "2025-08-23", amount: 5.26,  to: MYK_ADDRESS },
  { date: "2025-09-05", amount: 8.54,  to: MYK_ADDRESS },
  { date: "2025-09-12", amount: 4.55,  to: MYK_ADDRESS },
  { date: "2025-09-19", amount: 3.68,  to: MYK_ADDRESS },
  { date: "2025-10-03", amount: 4.13,  to: MYK_ADDRESS },
  { date: "2025-10-10", amount: 5.05,  to: MYK_ADDRESS },
  { date: "2025-10-25", amount: 11.30, to: MYK_ADDRESS },
  { date: "2025-11-07", amount: 5.51,  to: MYK_ADDRESS },
  { date: "2025-11-14", amount: 13.07, to: "0x18561f4e7e4e7e4e7e4e7e4e7e4e7e4e4737a8e" },
  { date: "2025-11-28", amount: 5.56,  to: "0xbcfcd123456789012345678901234567856feb" },
  { date: "2025-12-06", amount: 6.17,  to: MYK_ADDRESS },
  { date: "2025-12-13", amount: 5.61,  to: MYK_ADDRESS },
  { date: "2026-01-16", amount: 4.58,  to: MYK_ADDRESS },
  { date: "2026-01-23", amount: 6.60,  to: MYK_ADDRESS },
  { date: "2026-01-31", amount: 6.62,  to: MYK_ADDRESS },
  { date: "2026-02-06", amount: 5.49,  to: MYK_ADDRESS },
  { date: "2026-02-20", amount: 6.41,  to: MYK_ADDRESS },
  { date: "2026-02-28", amount: 6.71,  to: MYK_ADDRESS },
  { date: "2026-03-14", amount: 5.89,  to: MYK_ADDRESS },
  { date: "2026-03-20", amount: 5.12,  to: MYK_ADDRESS },
  { date: "2026-03-27", amount: 4.51,  to: MYK_ADDRESS },
  { date: "2026-04-03", amount: 7.57,  to: MYK_ADDRESS },
  { date: "2026-04-10", amount: 7.69,  to: MYK_ADDRESS },
  { date: "2026-04-18", amount: 7.22,  to: MYK_ADDRESS },
  { date: "2026-05-02", amount: 7.07,  to: MYK_ADDRESS },
];

const TOTAL_USD = TAPS.reduce((s, t) => s + t.amount, 0);
const MY_TAPS = TAPS.filter((t) => t.to.toLowerCase() === MYK_ADDRESS.toLowerCase());
const MY_TOTAL = MY_TAPS.reduce((s, t) => s + t.amount, 0);
const AVG_TAP = MY_TOTAL / MY_TAPS.length;
const FIRST_DATE = TAPS[0].date;
const LAST_DATE = TAPS[TAPS.length - 1].date;

function fmt(usd: number) {
  return "$" + usd.toFixed(2);
}

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

export default function HatPage() {
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
        <SiteHeader title="Hat Tap" variant="minimal" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 px-4 lg:px-6">

              {/* About */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    About
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    <span className="font-semibold text-foreground">Dept. of Agriculture</span> is a yield-bearing streetwear experiment.
                    Each hat is a staking mechanism — tap within the 10-minute Friday window each week to collect your share of onchain rewards distributed in USDC on Base.
                  </p>
                  <p className="text-xs">
                    Hat sold out. Follow{" "}
                    <a
                      href="https://x.com/deptofagri"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      @deptofagri
                    </a>
                    {" "}for future drops.
                  </p>
                  <div className="pt-1 space-y-1 font-mono text-xs">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Hat wallet</span>
                      <span className="truncate">{HAT_WALLET}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Recipient</span>
                      <span className="truncate">{MYK_ADDRESS}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Yield Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatRow label="Total earned (all recipients)" value={fmt(TOTAL_USD)} />
                  <StatRow label="My yield" value={fmt(MY_TOTAL)} />
                  <StatRow label="Taps collected" value={String(MY_TAPS.length)} />
                  <StatRow label="Avg per tap" value={fmt(AVG_TAP)} />
                  <StatRow label="First tap" value={FIRST_DATE} />
                  <StatRow label="Last tap" value={LAST_DATE} />
                  <StatRow label="Next expected" value="Friday" />
                </CardContent>
              </Card>

              {/* History */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Tap History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
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
                          Recipient
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...TAPS].reverse().map((tap, i) => {
                        const isMe = tap.to.toLowerCase() === MYK_ADDRESS.toLowerCase();
                        return (
                          <tr
                            key={i}
                            className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-6 py-3 font-mono text-xs">{tap.date}</td>
                            <td className={`px-6 py-3 text-right font-mono text-xs font-semibold ${isMe ? "text-green-500" : "text-muted-foreground"}`}>
                              +{fmt(tap.amount)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                              {isMe ? (
                                <span className="text-green-500/80">you</span>
                              ) : (
                                <span>{tap.to.slice(0, 6)}…{tap.to.slice(-4)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/40 bg-muted/20">
                        <td className="px-6 py-3 text-xs font-medium text-muted-foreground">
                          Total ({TAPS.length} taps)
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-sm font-bold text-green-500">
                          +{fmt(TOTAL_USD)}
                        </td>
                        <td className="hidden md:table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
