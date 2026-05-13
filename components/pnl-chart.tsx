"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Snapshot {
  date: string;
  totalValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsdCum: number;
}

interface Props {
  series: Snapshot[];
}

const chartConfig = {
  value: { label: "Portfolio Value", color: "var(--chart-1)" },
  pnl: { label: "Total PnL", color: "var(--chart-2)" },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatDate(d: string) {
  return dateFormatter.format(new Date(`${d}T00:00:00Z`));
}

function usd(n: number) {
  return compactUsdFormatter.format(n);
}

export function PnlChart({ series }: Props) {
  const chartData = useMemo(
    () =>
      series.map((s) => ({
        date: formatDate(s.date),
        value: s.totalValueUsd,
        pnl: s.unrealizedPnlUsd + s.realizedPnlUsdCum,
      })),
    [series]
  );

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No chart data yet — run Sync to populate.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="value">
          <TabsList className="mb-4">
            <TabsTrigger value="value">Portfolio Value</TabsTrigger>
            <TabsTrigger value="pnl">PnL</TabsTrigger>
          </TabsList>

          <TabsContent value="value">
            <ChartContainer config={chartConfig} className="h-64">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v) =>
                        usdFormatter.format(v as number)
                      }
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
          </TabsContent>

          <TabsContent value="pnl">
            <ChartContainer config={chartConfig} className="h-64">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v) =>
                        usdFormatter.format(v as number)
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke="var(--color-pnl)"
                  fill="var(--color-pnl)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
