"use client";

import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLinkIcon } from "lucide-react";

// ── types ────────────────────────────────────────────────────────────────────

interface QuotientPosition {
  signalId: string;
  marketId: string | null;
  headline: string;
  slug: string;
  side: "YES" | "NO";
  status: "open" | "closed";
  shadowStakeUsd: number | null;
  shadowEntryCost: number | null;
  shadowExitCost: number | null;
  shadowPnlUsd: number | null;
  shadowRoiPct: number | null;
  liveStakeUsd: number | null;
  liveEntryPrice: number | null;
  liveExitPrice: number | null;
  livePnlUsd: number | null;
  liveEntryTx: string | null;
  liveExitTx: string | null;
  entryRef: number | null;
  targetCost: number | null;
  volume24h: number | null;
  publishedAt: string | null;
  enteredAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
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

function closeReasonLabel(r: string | null): string {
  if (r === "target_hit") return "Target hit";
  if (r === "time_stop") return "Time stop (7d)";
  if (r === "resolution") return "Resolved";
  return r ?? "—";
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
    const closed = positions.filter((p) => p.status === "closed");
    const open = positions.filter((p) => p.status === "open");
    const shadowWins = closed.filter((p) => (p.shadowPnlUsd ?? 0) > 0).length;
    const shadowPnl = closed.reduce((s, p) => s + (p.shadowPnlUsd ?? 0), 0);
    const liveClosed = closed.filter((p) => p.livePnlUsd !== null);
    const livePnl = liveClosed.reduce((s, p) => s + (p.livePnlUsd ?? 0), 0);
    const liveWins = liveClosed.filter((p) => (p.livePnlUsd ?? 0) > 0).length;
    const winRate = closed.length > 0 ? (shadowWins / closed.length) * 100 : 0;
    const avgRoi =
      closed.length > 0
        ? closed.reduce((s, p) => s + (p.shadowRoiPct ?? 0), 0) / closed.length
        : 0;
    return {
      open: open.length,
      closed: closed.length,
      shadowWins,
      shadowPnl,
      winRate,
      avgRoi,
      livePnl,
      liveWins,
      liveClosed: liveClosed.length,
    };
  }, [positions]);

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");

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
                  upside to Quotient's fair price, ≥$10k 24h volume, ≤40% drift from publish,
                  ≤48h signal age, one position per market ever.
                </p>
                <p>
                  Exits: take-profit at Quotient's fair price, 7-day time stop, or market
                  resolution. Sizing $25 base / $50 high-conviction, max 4 concurrent, $100/wk
                  loss halt, kill switch if trailing-20 win rate drops below 50%.
                </p>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  {
                    label: "Shadow P&L",
                    value: fmtUsd(stats.shadowPnl, true),
                    positive: stats.shadowPnl >= 0,
                  },
                  {
                    label: "Live P&L",
                    value: stats.liveClosed > 0 ? fmtUsd(stats.livePnl, true) : "—",
                    positive: stats.livePnl >= 0,
                  },
                  {
                    label: "Win rate (shadow)",
                    value: stats.closed > 0 ? `${stats.shadowWins}/${stats.closed} (${stats.winRate.toFixed(0)}%)` : "—",
                    positive: stats.winRate >= 50,
                  },
                  {
                    label: "Avg ROI / trade",
                    value: stats.closed > 0 ? `+${stats.avgRoi.toFixed(1)}%` : "—",
                    positive: stats.avgRoi >= 0,
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

              {/* Open positions */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Open positions ({open.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {open.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No open positions.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/40">
                            {["Market", "Side", "Entry ¢", "Target ¢", "Stake", "Vol 24h", "Entered", "Ends"].map(
                              (h) => (
                                <th
                                  key={h}
                                  className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
                                >
                                  {h}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {open.map((p) => (
                            <tr
                              key={p.signalId}
                              className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors"
                            >
                              <td className="px-2 py-2 max-w-[280px]">
                                <a
                                  href={`https://polymarket.com/event/${p.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline underline-offset-2"
                                  title={p.headline}
                                >
                                  {p.headline.length > 60 ? p.headline.slice(0, 60) + "…" : p.headline}
                                </a>
                              </td>
                              <td className="px-2 py-2">
                                <span
                                  className={`rounded px-1 py-0.5 font-mono ${
                                    p.side === "YES"
                                      ? "bg-green-500/15 text-green-400"
                                      : "bg-orange-500/15 text-orange-400"
                                  }`}
                                >
                                  {p.side}
                                </span>
                              </td>
                              <td className="px-2 py-2 font-mono">{p.shadowEntryCost ?? "—"}</td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {p.targetCost ?? "—"}
                              </td>
                              <td className="px-2 py-2 font-mono">{fmtUsd(p.shadowStakeUsd)}</td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {p.volume24h ? `$${(p.volume24h / 1000).toFixed(1)}k` : "—"}
                              </td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {fmtDate(p.enteredAt)}
                              </td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {fmtDate(p.endDate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Closed positions */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Closed positions ({closed.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {closed.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No closed positions yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/40">
                            {[
                              "Market",
                              "Side",
                              "Entry ¢",
                              "Exit ¢",
                              "Shadow P&L",
                              "ROI",
                              "Live P&L",
                              "Exit reason",
                              "Closed",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {closed.map((p) => (
                            <tr
                              key={p.signalId}
                              className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors"
                            >
                              <td className="px-2 py-2 max-w-[280px]">
                                <a
                                  href={`https://polymarket.com/event/${p.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline underline-offset-2"
                                  title={p.headline}
                                >
                                  {p.headline.length > 55 ? p.headline.slice(0, 55) + "…" : p.headline}
                                </a>
                              </td>
                              <td className="px-2 py-2">
                                <span
                                  className={`rounded px-1 py-0.5 font-mono ${
                                    p.side === "YES"
                                      ? "bg-green-500/15 text-green-400"
                                      : "bg-orange-500/15 text-orange-400"
                                  }`}
                                >
                                  {p.side}
                                </span>
                              </td>
                              <td className="px-2 py-2 font-mono">{p.shadowEntryCost ?? "—"}</td>
                              <td className="px-2 py-2 font-mono">{p.shadowExitCost ?? "—"}</td>
                              <td className="px-2 py-2 font-mono">
                                <span
                                  className={
                                    (p.shadowPnlUsd ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                                  }
                                >
                                  {fmtUsd(p.shadowPnlUsd, true)}
                                </span>
                              </td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {p.shadowRoiPct !== null ? `${p.shadowRoiPct.toFixed(1)}%` : "—"}
                              </td>
                              <td className="px-2 py-2 font-mono">
                                {p.livePnlUsd !== null ? (
                                  <span
                                    className={p.livePnlUsd >= 0 ? "text-green-400" : "text-red-400"}
                                    title={
                                      p.liveExitTx
                                        ? `exit tx: ${p.liveExitTx}`
                                        : undefined
                                    }
                                  >
                                    {fmtUsd(p.livePnlUsd, true)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-muted-foreground">
                                {closeReasonLabel(p.closeReason)}
                              </td>
                              <td className="px-2 py-2 font-mono text-muted-foreground">
                                {fmtDate(p.closedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

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
