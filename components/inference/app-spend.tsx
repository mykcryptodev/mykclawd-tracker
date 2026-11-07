"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AppSpend, SurplusApps } from "@/lib/inference/spend";

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

function sumUsd(daily: { usd: number }[]) {
  return daily.reduce((acc, d) => acc + d.usd, 0);
}

function shortDay(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function AppSpendSection({ data }: { data: SurplusApps | null }) {
  if (!data || !data.apps.length) return null;

  const wishlist = data.apps.find((a) => a.name === "Wishlist");
  const wishlistDaily = wishlist ? wishlist.daily.slice(-30) : [];
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
          Usage by app{wishlist?.since ? ` — Wishlist since ${shortDate(wishlist.since)}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Same Surplus request log, split by API key. Wishlist = wishlist.holiday&apos;s Muse calls. Updated {updated}.
        </p>
      </div>

      {wishlist && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Wishlist spend" value={usd.format(wishlist.total_usd)} />
            <Stat label="Wishlist requests" value={count.format(wishlist.total_requests)} />
            <Stat label="Wishlist last 7 days" value={usd.format(sumUsd(wishlist.daily.slice(-7)))} />
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="mb-2 text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
              Wishlist daily spend (UTC)
            </p>
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              <BarChart data={wishlistDaily} margin={{ left: 4, right: 8, top: 8 }}>
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
        </>
      )}

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="mb-3 text-[11px] uppercase tracking-widest font-medium text-muted-foreground">All apps</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="pb-2 font-medium">App</th>
              <th className="pb-2 text-right font-medium">Spend</th>
              <th className="pb-2 text-right font-medium">Requests</th>
              <th className="pb-2 text-right font-medium">Last request</th>
            </tr>
          </thead>
          <tbody>
            {data.apps.map((a) => (
              <tr key={a.name} className="border-t border-border/40">
                <td className="py-1.5 font-mono text-xs">{a.name}</td>
                <td className="py-1.5 text-right tabular-nums">{usd.format(a.total_usd)}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{count.format(a.total_requests)}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{shortDay(a.last_request_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
