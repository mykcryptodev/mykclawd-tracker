import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderRow } from "@/components/portfolio/holdings-table";
import { TokenPriceChart } from "@/components/portfolio/token-price-chart";
import { getPositionDetail } from "@/lib/portfolio/read";
import {
  fetchTokenTradeHistory,
  fetchZerionFungibleId,
  fetchZerionFungibleChart,
  NATIVE_ETH_ADDRESS,
  type TokenTradeHistory,
  type PricePoint,
} from "@/lib/portfolio/zerion";
import { filterPortfolioOrders, isActivePortfolioOrder } from "@/lib/portfolio/orders";

export const dynamic = "force-dynamic";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ?? "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

export const metadata: Metadata = {
  title: "Holding",
};

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function fmtPrice(p: number | null): string {
  if (p === null || p === 0) return "N/A";
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  if (p >= 0.000001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(2)}`;
}

function gainClass(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-green-500" : "text-red-500";
}

function fmtGain(v: number | null, pct: number | null): string {
  if (v === null) return "N/A";
  const sign = v >= 0 ? "+" : "";
  const pctStr = pct !== null ? ` (${sign}${pct.toFixed(1)}%)` : "";
  return `${sign}${fullUsd.format(v)}${pctStr}`;
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

const tradeDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
});

const ACTION_STYLE: Record<string, string> = {
  buy: "text-green-500",
  receive: "text-green-500/80",
  sell: "text-red-500",
  send: "text-red-500/80",
  other: "text-muted-foreground",
};

const DAY_SECONDS = 24 * 60 * 60;

function recentPoints(points: PricePoint[], days: number): PricePoint[] {
  const latest = points.at(-1);
  if (!latest) return [];
  const cutoff = latest.ts - days * DAY_SECONDS;
  return points.filter((p) => p.ts >= cutoff);
}

async function fetchChartSeries(fungibleId: string): Promise<{
  week: PricePoint[];
  month: PricePoint[];
  max: PricePoint[];
}> {
  const empty: PricePoint[] = [];
  const max = await fetchZerionFungibleChart(fungibleId, "max").catch(() => empty);
  if (max.length > 0) {
    return {
      week: recentPoints(max, 7),
      month: recentPoints(max, 31),
      max,
    };
  }

  const month = await fetchZerionFungibleChart(fungibleId, "month").catch(() => empty);
  const week = await fetchZerionFungibleChart(fungibleId, "week").catch(() => empty);
  return { week, month, max };
}

function StatCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex flex-col gap-0.5 py-3 px-4">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={`text-lg font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenAddress = token.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(tokenAddress)) notFound();

  const { meta, position } = await getPositionDetail(tokenAddress);
  if (!position) notFound();

  // Live Zerion data — same source as the positions/PnL sync, fetched fresh so
  // trade history and the chart are never staler than the page load.
  const emptyHistory: TokenTradeHistory = { trades: [], truncated: false, maxPages: 25 };
  const [tradeHistory, fungibleId] = await Promise.all([
    fetchTokenTradeHistory(TRACKED_ADDRESS, tokenAddress).catch(() => emptyHistory),
    fetchZerionFungibleId(tokenAddress).catch(() => null),
  ]);
  const trades = tradeHistory.trades;

  const chartSeries = fungibleId
    ? await fetchChartSeries(fungibleId)
    : { week: [], month: [], max: [] };

  // Prefer a cost basis aligned with the displayed Zerion PnL. The local lot
  // engine and trade-history average are fallbacks when Zerion lacks PnL fields.
  const zerionAvgCostUsd = positiveFinite(
    position.pnl?.unrealizedGain !== null && position.pnl?.unrealizedGain !== undefined && position.balance > 0
      ? (position.balanceUsd - position.pnl.unrealizedGain) / position.balance
      : null
  );
  const buys = trades.filter((t) => t.action === "buy" && t.tokenValueUsd !== null);
  const buyQty = buys.reduce((s, t) => s + t.tokenQty, 0);
  const buyValue = buys.reduce((s, t) => s + (t.tokenValueUsd ?? 0), 0);
  const tradeAvgEntryUsd = positiveFinite(buyQty > 0 ? buyValue / buyQty : null);
  const avgEntryUsd = zerionAvgCostUsd ?? positiveFinite(position.avgCostUsd) ?? tradeAvgEntryUsd;
  const avgEntrySource = zerionAvgCostUsd
    ? "Zerion PnL basis"
    : positiveFinite(position.avgCostUsd)
      ? "tracker lot basis"
      : tradeAvgEntryUsd
        ? "buy-history estimate"
        : null;
  const fromEntry =
    avgEntryUsd && position.price ? position.price / avgEntryUsd : null;

  const activeOrders = position.orders.filter(isActivePortfolioOrder);
  const historicalOrders = filterPortfolioOrders(position.orders, true).filter(
    (o) => !isActivePortfolioOrder(o)
  );

  const basescanTx = (hash: string) => `https://basescan.org/tx/${hash}`;
  const basescanToken =
    tokenAddress === NATIVE_ETH_ADDRESS
      ? `https://basescan.org/address/${TRACKED_ADDRESS}`
      : `https://basescan.org/token/${tokenAddress}?a=${TRACKED_ADDRESS}`;

  const chartMarkers = trades
    .filter((t) => t.action === "buy" || t.action === "sell")
    .map((t) => ({
      ts: t.minedAt,
      action: t.action,
      priceUsd: t.tokenPriceUsd,
      qty: t.tokenQty,
      valueUsd: t.tokenValueUsd,
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
          asOfTs={meta?.syncedAt ?? null}
          title={`${position.symbol || tokenAddress.slice(0, 8)}`}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-6 px-4 lg:px-6 md:gap-6">
              {/* Back + token identity */}
              <div className="flex items-center gap-3">
                <Link
                  href="/pnl"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Portfolio
                </Link>
                <span className="text-muted-foreground/40">/</span>
                <div className="flex items-center gap-2">
                  {position.imgUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={position.imgUrl}
                      alt=""
                      className="size-6 rounded-full object-cover"
                    />
                  )}
                  <span className="font-semibold">{position.symbol}</span>
                  {position.name && position.name !== position.symbol && (
                    <span className="text-xs text-muted-foreground">{position.name}</span>
                  )}
                  <a
                    href={basescanToken}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                PnL uses the latest tracker sync. Chart and transaction rows are fetched from Zerion live.
              </p>

              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Price" value={fmtPrice(position.price)} />
                <StatCard
                  label="Balance"
                  value={qtyFmt.format(position.balance)}
                  sub={fullUsd.format(position.balanceUsd)}
                />
                <StatCard
                  label="Avg cost"
                  value={fmtPrice(avgEntryUsd)}
                  sub={
                    [fromEntry ? `${fromEntry.toFixed(2)}x current` : null, avgEntrySource]
                      .filter(Boolean)
                      .join(" - ") || undefined
                  }
                  valueClass={fromEntry === null ? "" : fromEntry >= 1 ? "text-green-500" : "text-red-500"}
                />
                <StatCard
                  label="Unrealized PnL"
                  value={fmtGain(position.pnl?.unrealizedGain ?? null, position.pnl?.unrealizedGainPct ?? null)}
                  valueClass={gainClass(position.pnl?.unrealizedGain ?? null)}
                />
                <StatCard
                  label="Realized PnL"
                  value={fmtGain(position.pnl?.realizedGain ?? null, position.pnl?.realizedGainPct ?? null)}
                  valueClass={gainClass(position.pnl?.realizedGain ?? null)}
                />
                <StatCard
                  label="Total PnL"
                  value={fmtGain(position.pnl?.totalGain ?? null, position.pnl?.totalGainPct ?? null)}
                  sub={
                    position.pnl?.totalInvested
                      ? `${fullUsd.format(position.pnl.totalInvested)} invested`
                      : undefined
                  }
                  valueClass={gainClass(position.pnl?.totalGain ?? null)}
                />
              </div>

              {/* Price chart with entries/exits */}
              <TokenPriceChart
                symbol={position.symbol}
                series={chartSeries}
                trades={chartMarkers}
              />

              {/* Orders */}
              {position.orders.length > 0 && (
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                      Orders ({activeOrders.length} active
                      {historicalOrders.length > 0 ? `, ${historicalOrders.length} past` : ""})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1.5">
                    {activeOrders.length === 0 && historicalOrders.length === 0 && (
                      <p className="text-xs text-muted-foreground">No orders for this token.</p>
                    )}
                    {activeOrders.map((o) => (
                      <OrderRow key={`${o.source}-${o.orderId}`} order={o} avgCostUsd={avgEntryUsd} />
                    ))}
                    {historicalOrders.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                          Past orders ({historicalOrders.length})
                        </summary>
                        <div className="flex flex-col gap-1.5 mt-1.5">
                          {historicalOrders.map((o) => (
                            <OrderRow key={`${o.source}-${o.orderId}`} order={o} avgCostUsd={avgEntryUsd} />
                          ))}
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Trade history */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                    Transactions ({trades.length})
                  </CardTitle>
                  {tradeHistory.truncated && (
                    <p className="text-xs text-amber-500">
                      Showing newest {trades.length} Zerion matches. Older pages were capped for page load safety.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {trades.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-4 pb-4">
                      No transaction history found via Zerion.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/40 text-muted-foreground">
                            <th className="text-left font-medium px-4 py-2">Date</th>
                            <th className="text-left font-medium px-2 py-2">Action</th>
                            <th className="text-right font-medium px-2 py-2">Qty</th>
                            <th className="text-right font-medium px-2 py-2">Price</th>
                            <th className="text-right font-medium px-2 py-2">Value</th>
                            <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">
                              Against
                            </th>
                            <th className="px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {trades.map((t) => (
                            <tr
                              key={`${t.hash}-${t.minedAt}`}
                              className="border-b border-border/20 hover:bg-muted/30"
                            >
                              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                                {tradeDateFmt.format(t.minedAt * 1000)}
                              </td>
                              <td className={`px-2 py-2 font-semibold uppercase ${ACTION_STYLE[t.action] ?? ""}`}>
                                {t.action}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {qtyFmt.format(t.tokenQty)}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {fmtPrice(t.tokenPriceUsd)}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums font-medium">
                                {t.tokenValueUsd !== null ? fullUsd.format(t.tokenValueUsd) : "N/A"}
                              </td>
                              <td className="px-2 py-2 hidden sm:table-cell text-muted-foreground">
                                {t.counterSymbol
                                  ? `${t.counterQty !== null ? qtyFmt.format(t.counterQty) + " " : ""}${t.counterSymbol}`
                                  : "N/A"}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <a
                                  href={basescanTx(t.hash)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground inline-block"
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
