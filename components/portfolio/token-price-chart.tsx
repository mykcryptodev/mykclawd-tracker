"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ChartPricePoint {
  ts: number; // unix seconds
  price: number;
}

export interface ChartTradeMarker {
  ts: number; // unix seconds
  action: "buy" | "sell" | "send" | "receive" | "other";
  priceUsd: number | null;
  qty: number;
  valueUsd: number | null;
}

interface Props {
  symbol: string;
  series: { week: ChartPricePoint[]; month: ChartPricePoint[]; max: ChartPricePoint[] };
  trades: ChartTradeMarker[];
}

const TIMEFRAMES = [
  { key: "1W", series: "week" },
  { key: "1M", series: "month" },
  { key: "MAX", series: "max" },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

const chartConfig = {
  price: { label: "Price", color: "var(--chart-1)" },
};

const BUY_COLOR = "var(--color-green-500, #22c55e)";
const SELL_COLOR = "var(--color-red-500, #ef4444)";

function fmtPrice(p: number): string {
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  if (p >= 0.000001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(2)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

interface MarkerDatum extends ChartTradeMarker {
  markerPrice: number;
  fill: string;
}

function nearestPrice(points: ChartPricePoint[], ts: number): number | null {
  if (points.length === 0) return null;
  let best = points[0];
  for (const p of points) {
    if (Math.abs(p.ts - ts) < Math.abs(best.ts - ts)) best = p;
  }
  return best.price;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown>; dataKey?: string | number }>;
}) {
  if (!active || !payload?.length) return null;

  const marker = payload.find((p) => p.dataKey === "markerPrice")?.payload as
    | MarkerDatum
    | undefined;
  const pricePoint = payload.find((p) => p.dataKey === "price")?.payload as
    | ChartPricePoint
    | undefined;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      {marker ? (
        <div className="flex flex-col gap-0.5">
          <span
            className="font-semibold uppercase"
            style={{ color: marker.action === "buy" || marker.action === "receive" ? BUY_COLOR : SELL_COLOR }}
          >
            {marker.action}
          </span>
          <span>{dateTimeFormatter.format(marker.ts * 1000)}</span>
          <span>
            {qtyFmt.format(marker.qty)} @{" "}
            {marker.priceUsd !== null
              ? fmtPrice(marker.priceUsd)
              : `${fmtPrice(marker.markerPrice)} chart`}
          </span>
          {marker.valueUsd !== null && <span>{usdFmt.format(marker.valueUsd)}</span>}
        </div>
      ) : pricePoint ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">
            {dateTimeFormatter.format((pricePoint.ts as number) * 1000)}
          </span>
          <span className="font-medium">{fmtPrice(pricePoint.price as number)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TokenPriceChart({ symbol, series, trades }: Props) {
  const [tf, setTf] = useState<TimeframeKey>("1M");

  const availableFrames = useMemo(
    () => TIMEFRAMES.filter((t) => series[t.series].length > 0),
    [series]
  );

  const activeFrame = useMemo(
    () => availableFrames.find((t) => t.key === tf) ?? availableFrames[0] ?? TIMEFRAMES[0],
    [availableFrames, tf]
  );

  const activeSeries = useMemo(() => {
    return series[activeFrame.series];
  }, [activeFrame, series]);



  const markers = useMemo<MarkerDatum[]>(() => {
    if (activeSeries.length === 0) return [];
    const minTs = activeSeries[0].ts;
    const maxTs = activeSeries[activeSeries.length - 1].ts;
    return trades
      .filter((t) => t.ts >= minTs && t.ts <= maxTs)
      .map((t) => {
        const markerPrice = t.priceUsd ?? nearestPrice(activeSeries, t.ts);
        if (markerPrice === null) return null;
        const isIn = t.action === "buy" || t.action === "receive";
        return { ...t, markerPrice, fill: isIn ? BUY_COLOR : SELL_COLOR };
      })
      .filter((m): m is MarkerDatum => m !== null);
  }, [activeSeries, trades]);

  const hiddenTrades = useMemo(() => {
    if (activeSeries.length === 0) return trades.length;
    const minTs = activeSeries[0].ts;
    return trades.filter((t) => t.ts < minTs).length;
  }, [activeSeries, trades]);

  // With `auto/auto` recharts pads the domain by ~10%, which for a
  // slow-moving token can turn a ±10% range into a nearly flat line at the
  // center of the chart. Use an exact [min,max] domain with a small margin
  // instead so the price movement fills the plot.
  const priceDomain = useMemo<[number, number] | ["auto", "auto"]>(() => {
    const prices = activeSeries.map((p) => p.price).filter((v) => Number.isFinite(v));
    for (const m of markers) if (Number.isFinite(m.markerPrice)) prices.push(m.markerPrice);
    if (prices.length === 0) return ["auto", "auto"];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      const pad = Math.abs(min) * 0.01 || 1;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.06;
    return [min - pad, max + pad];
  }, [activeSeries, markers]);

  if (series.max.length === 0 && series.month.length === 0 && series.week.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          No price history available for {symbol}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>{symbol} price</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            <span style={{ color: BUY_COLOR }}>●</span> buys{" "}
            <span style={{ color: SELL_COLOR }}>●</span> sells
            {hiddenTrades > 0 && ` - ${hiddenTrades} older trade${hiddenTrades === 1 ? "" : "s"} outside this window`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              disabled={series[t.series].length === 0}
              onClick={() => setTf(t.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                activeFrame.key === t.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.key}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-72 w-full">
          <ComposedChart data={activeSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => dateFormatter.format((v as number) * 1000)}
              tick={{ fontSize: 11 }}
              minTickGap={48}
            />
            <YAxis
              tickFormatter={(v) => fmtPrice(v as number)}
              tick={{ fontSize: 11 }}
              width={72}
              domain={priceDomain}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-price)"
              fill="var(--color-price)"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Scatter data={markers} dataKey="markerPrice" isAnimationActive={false}>
              {markers.map((m, i) => (
                <Cell key={i} fill={m.fill} stroke="var(--background)" strokeWidth={1} r={5} />
              ))}
            </Scatter>
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
