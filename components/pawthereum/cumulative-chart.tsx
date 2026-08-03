"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface Point {
  date: string;
  cumulative: number;
  weekly: number;
}

const chartConfig = {
  cumulative: { label: "Cumulative", color: "var(--chart-1)" },
  weekly: { label: "This week", color: "var(--chart-2)" },
} satisfies ChartConfig;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function CumulativeChart({ data }: { data: Point[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillCumulative" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-cumulative)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-cumulative)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={shortDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tickMargin={4}
          tickFormatter={(v: number) => usd.format(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => shortDate(String(value))}
              formatter={(value, name) => [
                `${usd.format(Number(value))} `,
                chartConfig[name as keyof typeof chartConfig]?.label ?? name,
              ]}
            />
          }
        />
        <Area
          dataKey="cumulative"
          type="monotone"
          fill="url(#fillCumulative)"
          stroke="var(--color-cumulative)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
