"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  total_value_usd: number;
  unrealized_pnl_usd: number;
  realized_pnl_usd_cum: number;
}

interface Props {
  series: Snapshot[];
}

const chartConfig = {
  value: { label: "Portfolio Value", color: "hsl(var(--chart-1))" },
  pnl: { label: "Total PnL", color: "hsl(var(--chart-2))" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function PnlChart({ series }: Props) {
  const valueData = series.map((s) => ({
    date: formatDate(s.date),
    value: s.total_value_usd,
  }));

  const pnlData = series.map((s) => ({
    date: formatDate(s.date),
    pnl: s.unrealized_pnl_usd + s.realized_pnl_usd_cum,
  }));

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
              <AreaChart data={valueData}>
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
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(v as number)
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
              <AreaChart data={pnlData}>
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
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(v as number)
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
