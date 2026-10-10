"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SpendRow, SurplusSpend } from "@/lib/inference/spend";

const chartConfig = {
  usd: { label: "Spend", color: "var(--chart-1)" },
} satisfies ChartConfig;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdAxis = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("en-US");

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: SpendRow[]; total: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="mb-3 text-[11px] uppercase tracking-widest font-medium text-muted-foreground">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 text-right font-medium">Spend</th>
            <th className="pb-2 text-right font-medium">Share</th>
            <th className="pb-2 text-right font-medium">Requests</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((r) => (
            <tr key={r.name} className="border-t border-border/40">
              <td className="py-1.5 font-mono text-xs">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{usd.format(r.usd)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {total > 0 ? `${((r.usd / total) * 100).toFixed(1)}%` : "-"}
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{count.format(r.requests)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SurplusSpendSection({ data }: { data: SurplusSpend | null }) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        Spend data is unavailable right now.
      </div>
    );
  }

  const since = data.coverage_start ? shortDate(data.coverage_start.slice(0, 10)) : "start";
  const updated = new Date(data.generated_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Spend from the deposit balance, since {since}
        </p>
        <p className="text-xs text-muted-foreground">
          From the Surplus Intelligence request log, updated hourly. Last update {updated}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total spend" value={usd.format(data.total_usd)} />
        <Stat label="Paid requests" value={count.format(data.charged_requests)} />
        <Stat label="Providers" value={count.format(data.by_provider.length)} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="mb-2 text-[11px] uppercase tracking-widest font-medium text-muted-foreground">Daily spend (UTC)</p>
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
          <BarChart data={data.daily} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.4} />
            <XAxis
              dataKey="day"
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
              tickFormatter={(v: number) => usdAxis.format(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => shortDate(String(value))}
                  formatter={(value) => [usd.format(Number(value)), " Spend"]}
                />
              }
            />
            <Bar dataKey="usd" fill="var(--color-usd)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Breakdown title="By provider" rows={data.by_provider} total={data.total_usd} />
        <Breakdown title="By model" rows={data.by_model} total={data.total_usd} />
      </div>
    </div>
  );
}
