"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Blobbie } from "thirdweb/react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { PortfolioPosition, PortfolioOrder, TokenPnl } from "@/lib/portfolio/read";
import {
  filterPortfolioOrders,
  fmtRawTokenAmount,
  getTokenDecimals,
  isActivePortfolioOrder,
} from "@/lib/portfolio/orders";

interface Props {
  positions: PortfolioPosition[];
  trackedAddress: string;
}

type SortKey = "balanceUsd" | "balance" | "pctOfNav" | "totalGain" | "unrealizedGain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function fmtPrice(p: number | null): string {
  if (p === null || p === 0) return "—";
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  if (p >= 0.000001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(2)}`;
}

function fmtGain(v: number | null, pct: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const sign = v >= 0 ? "+" : "";
  const pctStr = pct !== null ? ` (${sign}${pct.toFixed(1)}%)` : "";
  return (
    <span className={v >= 0 ? "text-green-500" : "text-red-500"}>
      {sign}{fullUsd.format(v)}{pctStr}
    </span>
  );
}

function fmtChange(usd: number | null, pct: number | null): React.ReactNode {
  if (usd === null && pct === null) return <span className="text-muted-foreground">—</span>;
  const val = usd ?? 0;
  const sign = val >= 0 ? "+" : "";
  const pctStr = pct !== null ? ` (${sign}${pct.toFixed(2)}%)` : "";
  return (
    <span className={val >= 0 ? "text-green-500" : "text-red-500"}>
      {sign}{fullUsd.format(val)}{pctStr}
    </span>
  );
}

function basescanUrl(tokenAddress: string, owner: string): string {
  return tokenAddress === ZERO_ADDRESS
    ? `https://basescan.org/address/${owner}`
    : `https://basescan.org/token/${tokenAddress}?a=${owner}`;
}

function cowscanUrl(uid: string): string {
  return `https://explorer.cow.fi/orders/${uid}`;
}

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  cowswap: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  bankr: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  definitive: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const SOURCE_LABELS: Record<string, string> = {
  cowswap: "CoW",
  bankr: "Bankr",
  definitive: "Definitive",
};

// ── Status badge ─────────────────────────────────────────────────────────────

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case "open":
    case "active":
    case "pending":
      return "default";
    case "filled":
    case "fulfilled":
    case "completed":
    case "triggered":
      return "secondary";
    case "cancelled":
    case "expired":
    case "invalidated":
    case "presign":
      return "destructive";
    default:
      return "outline";
  }
}

// ── x from entry formatter ───────────────────────────────────────────────────

function fmtMultiple(priceUsd: number | null, avgCostUsd: number | null): string | null {
  if (priceUsd === null || avgCostUsd === null || avgCostUsd <= 0) return null;
  const x = priceUsd / avgCostUsd;
  return `${x.toFixed(2)}x`;
}

// ── Orders sub-panel ──────────────────────────────────────────────────────────

export function OrderRow({ order, avgCostUsd }: { order: PortfolioOrder; avgCostUsd: number | null }) {
  const sellDecimals = getTokenDecimals(order.sellToken);
  const buyDecimals = getTokenDecimals(order.buyToken);
  const srcColor = SOURCE_COLORS[order.source] ?? "bg-muted text-muted-foreground border-border";
  const srcLabel = SOURCE_LABELS[order.source] ?? order.source;

  const isCow = order.source === "cowswap";
  const isBankr = order.source === "bankr";
  const multiple = fmtMultiple(order.priceUsd, avgCostUsd);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 px-3 rounded-md bg-muted/40 text-xs">
      {/* Source + status */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-[120px]">
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${srcColor}`}>
          {srcLabel}
        </span>
        <Badge variant={statusVariant(order.status)} className="text-[10px] h-4 px-1.5">
          {order.status}
        </Badge>
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 flex-1 text-muted-foreground">
        {/* Side + type */}
        {order.side && (
          <span>
            <span className={order.side === "buy" ? "text-green-400" : "text-red-400"}>
              {order.side.toUpperCase()}
            </span>{" "}
            <span className="text-foreground/70">{order.type}</span>
          </span>
        )}
        {!order.side && order.type && (
          <span className="text-foreground/70">{order.type}</span>
        )}

        {/* Bankr: show description */}
        {isBankr && order.description && (
          <span className="text-foreground/80 max-w-xs truncate">{order.description}</span>
        )}

        {/* Target price + multiplier from entry */}
        {order.priceUsd !== null && (
          <span>
            @ {fmtPrice(order.priceUsd)}
            {multiple && (
              <span className="ml-1 font-semibold text-amber-400">{multiple} from entry</span>
            )}
          </span>
        )}

        {/* CoW: amounts */}
        {isCow && order.executedSellAmount && order.executedSellAmount !== "0" && (
          <span>
            Sold {fmtRawTokenAmount(order.executedSellAmount, sellDecimals)} → recv{" "}
            {fmtRawTokenAmount(order.executedBuyAmount, buyDecimals)}
          </span>
        )}
        {isCow && (!order.executedSellAmount || order.executedSellAmount === "0") && order.sellAmount && (
          <span>
            Sell {fmtRawTokenAmount(order.sellAmount, sellDecimals)} → buy{" "}
            {fmtRawTokenAmount(order.buyAmount, buyDecimals)}
          </span>
        )}

        {/* Quantity */}
        {!isCow && order.quantity && (
          <span>
            Qty {order.quantity}
            {order.filledQuantity && order.filledQuantity !== "0" && ` / filled ${order.filledQuantity}`}
          </span>
        )}

        {/* Created at */}
        {order.createdAt && (
          <span>{new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</span>
        )}

        {/* Expires */}
        {order.expiresAt && (
          <span>exp {new Date(order.expiresAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        )}
      </div>

      {/* External link (CoW only for now) */}
      {isCow && (
        <a
          href={cowscanUrl(order.orderId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

function PnlCell({ pnl }: { pnl: TokenPnl | null }) {
  if (!pnl || (pnl.totalGain === null && pnl.unrealizedGain === null)) {
    return <span className="text-muted-foreground">—</span>;
  }
  // Show unrealized (open position) + realized if available
  const unreal = pnl.unrealizedGain;
  const real = pnl.realizedGain;
  return (
    <div className="flex flex-col items-end gap-0.5 leading-tight">
      {unreal !== null && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">U</span>
          {fmtGain(unreal, pnl.unrealizedGainPct)}
        </div>
      )}
      {real !== null && real !== 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">R</span>
          {fmtGain(real, pnl.realizedGainPct)}
        </div>
      )}
    </div>
  );
}

// ── Column header helper ──────────────────────────────────────────────────────

function ColHead({
  label,
  k,
  align = "left",
  sortKey,
  asc,
  onSort,
}: {
  label: string;
  k?: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className={`${k ? "cursor-pointer select-none" : ""} ${align === "right" ? "text-right" : ""} whitespace-nowrap`}
      onClick={k ? () => onSort(k) : undefined}
    >
      {label}
      {k && sortKey === k && (asc ? " ↑" : " ↓")}
    </TableHead>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HoldingsTable({ positions, trackedAddress }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("balanceUsd");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAllOrders, setShowAllOrders] = useState(false);

  const hasAnyOrders = useMemo(
    () => positions.some((p) => p.orders.length > 0),
    [positions]
  );

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setAsc((v) => !v);
      else {
        setSortKey(key);
        setAsc(false);
      }
    },
    [sortKey]
  );

  const toggleExpand = useCallback((addr: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    const eth = positions.filter((p) => p.tokenAddress === ZERO_ADDRESS);
    const rest = positions.filter((p) => p.tokenAddress !== ZERO_ADDRESS).sort((a, b) => {
      const aVal =
        sortKey === "totalGain"
          ? (a.pnl?.totalGain ?? -Infinity)
          : sortKey === "unrealizedGain"
          ? (a.pnl?.unrealizedGain ?? -Infinity)
          : a[sortKey as keyof typeof a] as number;
      const bVal =
        sortKey === "totalGain"
          ? (b.pnl?.totalGain ?? -Infinity)
          : sortKey === "unrealizedGain"
          ? (b.pnl?.unrealizedGain ?? -Infinity)
          : b[sortKey as keyof typeof b] as number;
      return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return [...eth, ...rest];
  }, [positions, sortKey, asc]);

  if (rows.length === 0) {
    return (
      <Table>
        <TableBody>
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No holdings yet — run Sync to load data.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col">
      {hasAnyOrders && (
        <div className="flex items-center justify-end gap-2 border-b border-border/40 px-4 py-2">
          <span className="text-[10px] text-muted-foreground">
            {showAllOrders ? "Showing all synced orders" : "Active orders only"}
          </span>
          <Toggle
            variant="outline"
            size="sm"
            pressed={showAllOrders}
            onPressedChange={setShowAllOrders}
            aria-label="Show completed and presign orders"
          >
            All orders
          </Toggle>
        </div>
      )}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" /> {/* expand chevron */}
          <ColHead label="Token" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Price" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="24h" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Balance" k="balance" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Value" k="balanceUsd" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="% NAV" k="pctOfNav" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Unreal. PnL" k="unrealizedGain" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Total PnL" k="totalGain" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Orders" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => {
          const isOpen = expanded.has(p.tokenAddress);
          const visibleOrders = filterPortfolioOrders(p.orders, showAllOrders);
          const activeCount = p.orders.filter(isActivePortfolioOrder).length;
          const hasOrders = visibleOrders.length > 0;
          const canExpand = p.orders.length > 0;
          const detailUrl = `/pnl/${p.tokenAddress}`;
          return (
            <Fragment key={p.tokenAddress}>
              {/* ── Main row ── */}
              <TableRow
                className={`group cursor-pointer hover:bg-muted/50 ${isOpen ? "bg-muted/30" : ""}`}
                role="link"
                tabIndex={0}
                onClick={() => {
                  router.push(detailUrl);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(detailUrl);
                  }
                }}
              >
                {/* Chevron */}
                <TableCell className="w-8 pr-0">
                  {canExpand ? (
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={isOpen ? "Collapse token orders" : "Expand token orders"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(p.tokenAddress);
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  ) : (
                    <span className="size-4 inline-block" />
                  )}
                </TableCell>

                {/* Token */}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {p.imgUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imgUrl}
                        alt=""
                        className="size-5 rounded-full shrink-0 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Blobbie
                        address={p.tokenAddress}
                        size={20}
                        className="rounded-full shrink-0"
                      />
                    )}
                    <span>{p.symbol || p.tokenAddress.slice(0, 8)}</span>
                    {p.name && p.name !== p.symbol && (
                      <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[120px]">
                        {p.name}
                      </span>
                    )}
                    {/* Basescan link (always visible on hover) */}
                    <a
                      href={basescanUrl(p.tokenAddress, trackedAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </TableCell>

                {/* Price */}
                <TableCell className="text-right tabular-nums">
                  {fmtPrice(p.price)}
                </TableCell>

                {/* 24h */}
                <TableCell className="text-right tabular-nums text-xs">
                  {fmtChange(p.change1dUsd, p.change1dPct)}
                </TableCell>

                {/* Balance */}
                <TableCell className="text-right tabular-nums">
                  {qtyFormatter.format(p.balance)}
                </TableCell>

                {/* Value */}
                <TableCell className="text-right tabular-nums font-medium">
                  {fullUsd.format(p.balanceUsd)}
                </TableCell>

                {/* % NAV */}
                <TableCell className="text-right tabular-nums">
                  {p.pctOfNav.toFixed(1)}%
                </TableCell>

                {/* Unrealized PnL */}
                <TableCell className="text-right tabular-nums text-xs">
                  <PnlCell
                    pnl={
                      p.pnl
                        ? {
                            ...p.pnl,
                            realizedGain: null,
                            realizedGainPct: null,
                            totalGain: null,
                            totalGainPct: null,
                          }
                        : null
                    }
                  />
                </TableCell>

                {/* Total PnL */}
                <TableCell className="text-right tabular-nums text-xs">
                  {fmtGain(p.pnl?.totalGain ?? null, p.pnl?.totalGainPct ?? null)}
                </TableCell>

                {/* Orders count */}
                <TableCell className="text-right">
                  {hasOrders ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 tabular-nums">
                      {showAllOrders
                        ? String(visibleOrders.length)
                        : activeCount < p.orders.length
                          ? `${activeCount}/${p.orders.length}`
                          : String(activeCount)}
                    </Badge>
                  ) : canExpand ? (
                    <span
                      className="text-muted-foreground text-xs tabular-nums"
                      title="Enable All orders to view"
                    >
                      0/{p.orders.length}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>

              {/* ── Expanded orders panel ── */}
              {isOpen && canExpand && (
                <TableRow key={`${p.tokenAddress}-orders`} className="bg-muted/10 hover:bg-muted/20">
                  <TableCell colSpan={10} className="px-4 pb-3 pt-1">
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        Orders ({visibleOrders.length}
                        {!showAllOrders && p.orders.length > visibleOrders.length
                          ? ` of ${p.orders.length}`
                          : ""}
                        )
                      </div>
                      {visibleOrders.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">
                          No active orders. Turn on &quot;All orders&quot; above to see completed and presign entries.
                        </p>
                      ) : (
                        visibleOrders.map((order) => (
                          <OrderRow key={`${order.source}-${order.orderId}`} order={order} avgCostUsd={p.avgCostUsd} />
                        ))
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
