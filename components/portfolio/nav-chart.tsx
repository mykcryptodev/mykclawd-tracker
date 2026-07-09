"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NavPoint {
  date: string; // YYYY-MM-DD (UTC)
  valueUsd: number;
}

interface Props {
  series: NavPoint[];
}

const TIMEFRAMES = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "1Y", days: 365 },
  { key: "ALL", days: Infinity },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

const chartConfig = {
  value: { label: "NAV", color: "var(--chart-1)" },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDate(d: string) {
  return dateFormatter.format(new Date(`${d}T00:00:00Z`));
}

export function NavChart({ series }: Props) {
  const [tf, setTf] = useState<TimeframeKey>("1M");

  const data = useMemo(() => {
    const days = TIMEFRAMES.find((t) => t.key === tf)?.days ?? Infinity;
    let points = series;
    if (Number.isFinite(days) && series.length > 0) {
      // Anchor the window to the latest data point (deterministic across SSR/client,
      // unlike `new Date()` which can straddle a UTC midnight and cause a mismatch).
      const last = new Date(`${series[series.length - 1].date}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() - days);
      const cutoffStr = last.toISOString().slice(0, 10);
      points = series.filter((p) => p.date >= cutoffStr);
    }
    return points.map((p) => ({ date: formatDate(p.date), value: p.valueUsd }));
  }, [series, tf]);

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          No NAV history yet — run Sync to populate.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle>NAV over time</CardTitle>
          <span className="text-[11px] text-muted-foreground">Base wallet value incl. native ETH</span>
        </div>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTf(t.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                tf === t.key
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
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v) => compactUsd.format(v as number)}
              tick={{ fontSize: 11 }}
              width={56}
              domain={["auto", "auto"]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(v) => fullUsd.format(v as number)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
