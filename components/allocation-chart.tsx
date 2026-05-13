"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Position {
  symbol: string;
  valueUsd: number;
  isPriced: boolean;
}

interface Props {
  positions: Position[];
}

function renderLabel(props: PieLabelRenderProps): string {
  return `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const chartConfig = {};
const TOP_N = 5;
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function AllocationChart({ positions }: Props) {
  const data = useMemo(() => {
    const priced = positions
      .filter((p) => p.isPriced && p.valueUsd > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd);

    const top = priced.slice(0, TOP_N);
    const othersValue = priced.slice(TOP_N).reduce((s, p) => s + p.valueUsd, 0);

    return [
      ...top.map((p) => ({ name: p.symbol, value: p.valueUsd })),
      ...(othersValue > 0 ? [{ name: "Other", value: othersValue }] : []),
    ];
  }, [positions]);

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No priced positions to display.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              label={renderLabel}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => usdFormatter.format(Number(value))}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
