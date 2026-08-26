"use client";

import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLinkIcon } from "lucide-react";
import {
  closeReasonLabel,
  computeQuotientStats,
  inferExecutionStatus,
  inferLiveStatus,
  liveCostBasis,
  polygonscanTxUrl,
  polymarketUrl,
  type QuotientExecutionStatus,
  type QuotientLegStatus,
} from "@/lib/quotient";

// ── types ────────────────────────────────────────────────────────────────────

interface QuotientPosition {
  signalId: string;
  marketId: string | null;
  headline: string;
  slug: string;
  side: "YES" | "NO";
  status: "open" | "closed";
  executionStatus?: QuotientExecutionStatus;
  liveStatus?: QuotientLegStatus;
  liveSkipReason: string | null;
  liveSkippedAt: string | null;
  shadowStakeUsd: number | null;
  shadowEntryCost: number | null;
  shadowExitCost: number | null;
  shadowPnlUsd: number | null;
  shadowRoiPct: number | null;
  liveStakeUsd: number | null;
  liveEntryUsdc: number | null;
  liveEntryPrice: number | null;
  liveEntryShares: number | null;
  liveExitUsdc: number | null;
  liveExitPrice: number | null;
  liveExitShares: number | null;
  livePnlUsd: number | null;
  liveRoiPct: number | null;
  liveEntryTx: string | null;
  liveExitTx: string | null;
  liveEntryOrderId: string | null;
  liveExitOrderId: string | null;
  entryRef: number | null;
  targetCost: number | null;
  volume24h: number | null;
  publishedAt: string | null;
  enteredAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  liveCloseReason: string | null;
  endDate: string | null;
  syncedAt: number;
}

interface QuotientSync {
  syncedAt: number;
  phase: string;
  openCount: number;
  closedCount: number;
  shadowPnlUsd: number;
  livePnlUsd: number;
  liveOpenCount?: number;
  liveClosedCount?: number;
  liveSkippedCount?: number;
  liveOpenCostBasisUsd?: number;
  error: string | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined) return "—";
  const s = signed && v >= 0 ? "+" : "";
  return `${s}$${v.toFixed(2)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v <= 1 ? `${(v * 100).toFixed(1)}¢` : `${v.toFixed(1)}¢`;
}

function shortTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`;
}

function executionBadge(p: QuotientPosition) {
  const status = inferExecutionStatus(p);
  if (status === "real") {
    return <Badge className="bg-green-500/15 text-green-400 border-green-500/40">REAL</Badge>;
  }
  if (status === "live_skipped") {
    return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40">LIVE-SKIPPED</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">SHADOW</Badge>;
}

function MarketLink({ position, max = 60 }: { position: QuotientPosition; max?: number }) {
  const label = position.headline.length > max ? position.headline.slice(0, max) + "…" : position.headline;
  const href = polymarketUrl(position.slug);
  if (!href) return <span title={position.headline}>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline underline-offset-2"
      title={position.headline}
    >
      {label}
    </a>
  );
}

function TxLink({ tx, label }: { tx: string | null; label: string }) {
  const href = polygonscanTxUrl(tx);
  if (!tx || !href) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200 hover:underline underline-offset-2"
      title={tx}
    >
      {label}: {shortTx(tx)} <ExternalLinkIcon className="h-3 w-3" />
    </a>
  );
}

// ── component ────────────────────────────────────────────────────────────────

export default function QuotientPage() {
  const [positions, setPositions] = React.useState<QuotientPosition[]>([]);
  const [sync, setSync] = React.useState<QuotientSync | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/quotient")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setPositions(d.positions ?? []);
        setSync(d.sync ?? null);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const stats = React.useMemo(() => {
    return computeQuotientStats(positions);
  }, [positions]);

  const livePositions = positions.filter((p) => inferExecutionStatus(p) === "real");
  const liveOpen = livePositions.filter((p) => inferLiveStatus(p) === "open");
  const liveClosed = livePositions.filter((p) => inferLiveStatus(p) === "closed");
  const shadowOpen = positions.filter((p) => p.status === "open");
  const shadowClosed = positions.filter((p) => p.status === "closed");

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
        <SiteHeader title="Quotient" variant="minimal" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 px-4 lg:px-6">

              {/* Header */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl font-bold font-[family-name:var(--font-segment)]">
                  📡 Quotient Mirror
                </span>
                {sync && (
                  <Badge
                    variant="outline"
                    className={
                      sync.phase === "live"
                        ? "border-green-500 text-green-400"
                        : "border-yellow-500 text-yellow-400"
                    }
                  >
                    {sync.phase === "live" ? "LIVE" : "SHADOW"}
                  </Badge>
                )}
                {sync && (
                  <span className="text-xs text-muted-foreground">
                    synced {timeAgo(sync.syncedAt)}
                  </span>
                )}
                {loading && (
                  <span className="text-xs text-muted-foreground animate-pulse">loading…</span>
                )}
                {error && (
                  <span className="text-xs text-destructive">Error: {error}</span>
                )}
                <a
                  href="https://signal.quotient.social"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  signal.quotient.social <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </div>

              {/* Strategy blurb */}
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
                <p>
                  <span className="font-semibold text-foreground">The strategy:</span> Mirror
                  qualifying Quotient signals on Polymarket with our own entry filters — ≥8pp
                  upside to Quotient&apos;s fair price, ≥$10k 24h volume, ≤40% drift from publish,
                  ≤48h signal age, one position per market ever.
                </p>
                <p>
                  Exits: take-profit at Quotient&apos;s fair price, 7-day time stop, or market
                  resolution. Sizing $25 base / $50 high-conviction, max 6 concurrent,
                  max 2 per correlated theme, $200 deployed cap, $100/wk loss halt, and a
                  kill switch if trailing-20 win rate drops below 50%.
                </p>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  {
                    label: "Realized live P&L",
                    value: stats.liveClosed > 0 ? fmtUsd(stats.livePnl, true) : "—",
                    positive: stats.livePnl >= 0,
                  },
                  {
                    label: "Open live cost basis",
                    value: fmtUsd(sync?.liveOpenCostBasisUsd ?? stats.liveOpenCostBasis),
                    positive: true,
                  },
                  {
                    label: "Live closed",
                    value: `${stats.liveClosed} (${stats.liveWins} wins)`,
                    positive: stats.liveClosed === 0 || stats.liveWins / stats.liveClosed >= 0.5,
                  },
                  {
                    label: "Shadow P&L (paper)",
                    value: fmtUsd(stats.shadowPnl, true),
                    positive: stats.shadowPnl >= 0,
                  },
                ].map(({ label, value, positive }) => (
                  <div key={label} className="rounded-lg border border-border/40 p-3 text-center">
                    <div
                      className={`text-lg font-bold font-mono ${
                        positive ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {value}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <Tabs defaultValue="live" className="gap-4">
                <TabsList>
                  <TabsTrigger value="live">Live only ({livePositions.length})</TabsTrigger>
                  <TabsTrigger value="shadow">Shadow / paper ({positions.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="live" className="space-y-4">
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs text-muted-foreground">
                    Default view: only rows with real Polymarket fills. Realized live P&amp;L is cash-flow P&amp;L from closed live fills; open rows show cost basis and entry transaction links, not mark-to-market profit.
                  </div>

                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Open live positions ({liveOpen.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {liveOpen.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No open live positions.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/40">
                                {["Badge", "Market", "Side", "Live entry", "Cost basis", "Shares", "Entry tx", "Entered", "Shadow target"].map((h) => (
                                  <th key={h} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {liveOpen.map((p) => (
                                <tr key={p.signalId} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-2 py-2">{executionBadge(p)}</td>
                                  <td className="px-2 py-2 max-w-[280px]"><MarketLink position={p} /></td>
                                  <td className="px-2 py-2">
                                    <span className={`rounded px-1 py-0.5 font-mono ${p.side === "YES" ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>{p.side}</span>
                                  </td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.liveEntryPrice)}</td>
                                  <td className="px-2 py-2 font-mono">{fmtUsd(liveCostBasis(p))}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{p.liveEntryShares?.toFixed(4) ?? "—"}</td>
                                  <td className="px-2 py-2 font-mono"><TxLink tx={p.liveEntryTx} label="entry" /></td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtDate(p.enteredAt)}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtPrice(p.targetCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Closed live positions ({liveClosed.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {liveClosed.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No closed live positions yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/40">
                                {["Badge", "Market", "Side", "Entry", "Exit", "Cost basis", "Returned", "Realized live P&L", "Tx links", "Reason", "Closed"].map((h) => (
                                  <th key={h} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {liveClosed.map((p) => (
                                <tr key={p.signalId} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-2 py-2">{executionBadge(p)}</td>
                                  <td className="px-2 py-2 max-w-[260px]"><MarketLink position={p} max={55} /></td>
                                  <td className="px-2 py-2"><span className={`rounded px-1 py-0.5 font-mono ${p.side === "YES" ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>{p.side}</span></td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.liveEntryPrice)}</td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.liveExitPrice)}</td>
                                  <td className="px-2 py-2 font-mono">{fmtUsd(liveCostBasis(p))}</td>
                                  <td className="px-2 py-2 font-mono">{fmtUsd(p.liveExitUsdc)}</td>
                                  <td className="px-2 py-2 font-mono"><span className={(p.livePnlUsd ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(p.livePnlUsd, true)}</span></td>
                                  <td className="px-2 py-2 font-mono space-y-1"><div><TxLink tx={p.liveEntryTx} label="entry" /></div><div><TxLink tx={p.liveExitTx} label="exit" /></div></td>
                                  <td className="px-2 py-2 text-muted-foreground">{closeReasonLabel(p.liveCloseReason ?? p.closeReason)}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtDate(p.closedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="shadow" className="space-y-4">
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                    Paper/shadow rows remain useful for strategy evidence and opportunity-cost tracking. They are separate from cash results; rows marked LIVE-SKIPPED were eligible shadow signals that the live executor did not fill.
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: "Shadow P&L", value: fmtUsd(stats.shadowPnl, true), positive: stats.shadowPnl >= 0 },
                      { label: "Shadow win rate", value: stats.closed > 0 ? `${stats.shadowWins}/${stats.closed} (${stats.winRate.toFixed(0)}%)` : "—", positive: stats.winRate >= 50 },
                      { label: "Avg shadow ROI", value: stats.closed > 0 ? `${stats.avgRoi >= 0 ? "+" : ""}${stats.avgRoi.toFixed(1)}%` : "—", positive: stats.avgRoi >= 0 },
                      { label: "Live skipped", value: `${sync?.liveSkippedCount ?? stats.liveSkippedCount}`, positive: true },
                    ].map(({ label, value, positive }) => (
                      <div key={label} className="rounded-lg border border-border/40 p-3 text-center">
                        <div className={`text-lg font-bold font-mono ${positive ? "text-green-400" : "text-red-400"}`}>{value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
                      </div>
                    ))}
                  </div>

                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Open shadow positions ({shadowOpen.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {shadowOpen.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No open shadow positions.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/40">
                                {["Badge", "Market", "Side", "Shadow entry", "Target", "Paper stake", "Live note", "Entered", "Ends"].map((h) => (
                                  <th key={h} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shadowOpen.map((p) => (
                                <tr key={p.signalId} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-2 py-2">{executionBadge(p)}</td>
                                  <td className="px-2 py-2 max-w-[280px]"><MarketLink position={p} /></td>
                                  <td className="px-2 py-2"><span className={`rounded px-1 py-0.5 font-mono ${p.side === "YES" ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>{p.side}</span></td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.shadowEntryCost)}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtPrice(p.targetCost)}</td>
                                  <td className="px-2 py-2 font-mono">{fmtUsd(p.shadowStakeUsd)}</td>
                                  <td className="px-2 py-2 text-muted-foreground">{p.liveSkipReason ?? (inferExecutionStatus(p) === "real" ? "Filled live" : "Paper only")}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtDate(p.enteredAt)}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtDate(p.endDate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                        Closed shadow positions ({shadowClosed.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {shadowClosed.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No closed shadow positions yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/40">
                                {["Badge", "Market", "Side", "Entry", "Exit", "Shadow P&L", "ROI", "Live P&L", "Exit reason", "Closed"].map((h) => (
                                  <th key={h} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shadowClosed.map((p) => (
                                <tr key={p.signalId} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-2 py-2">{executionBadge(p)}</td>
                                  <td className="px-2 py-2 max-w-[280px]"><MarketLink position={p} max={55} /></td>
                                  <td className="px-2 py-2"><span className={`rounded px-1 py-0.5 font-mono ${p.side === "YES" ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>{p.side}</span></td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.shadowEntryCost)}</td>
                                  <td className="px-2 py-2 font-mono">{fmtPrice(p.shadowExitCost)}</td>
                                  <td className="px-2 py-2 font-mono"><span className={(p.shadowPnlUsd ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(p.shadowPnlUsd, true)}</span></td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{p.shadowRoiPct !== null ? `${p.shadowRoiPct.toFixed(1)}%` : "—"}</td>
                                  <td className="px-2 py-2 font-mono">{p.livePnlUsd !== null ? <span className={p.livePnlUsd >= 0 ? "text-green-400" : "text-red-400"}>{fmtUsd(p.livePnlUsd, true)}</span> : <span className="text-muted-foreground">—</span>}</td>
                                  <td className="px-2 py-2 text-muted-foreground">{closeReasonLabel(p.closeReason)}</td>
                                  <td className="px-2 py-2 font-mono text-muted-foreground">{fmtDate(p.closedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Footer note */}
              <p className="text-[10px] text-muted-foreground">
                Data: strategy books at trading/strategies/quotient-mirror (synced every 15 min).
                Shadow = paper results; Live = real Polymarket fills once Phase 2 is armed. Not
                financial advice.
              </p>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
