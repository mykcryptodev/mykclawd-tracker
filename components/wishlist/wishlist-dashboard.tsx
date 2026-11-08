"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WishlistStats } from "@/lib/wishlist/stats";

const count = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const activeConfig = {
  wau: { label: "Weekly active", color: "var(--chart-1)" },
  active: { label: "Daily active", color: "var(--chart-2)" },
} satisfies ChartConfig;

const growthConfig = {
  signups: { label: "Sign-ups", color: "var(--chart-1)" },
  items: { label: "Items added", color: "var(--chart-3)" },
} satisfies ChartConfig;

const exchangeConfig = {
  exchanges_created: { label: "Exchanges created", color: "var(--chart-2)" },
  exchange_joins: { label: "Joins", color: "var(--chart-4)" },
  gifts_claimed: { label: "Gifts claimed", color: "var(--chart-5)" },
} satisfies ChartConfig;

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">{children}</p>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <Label>{label}</Label>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-2">
        <Label>{title}</Label>
      </div>
      {children}
    </div>
  );
}

function Breakdown({ rows }: { rows: { name: string; value: number }[] }) {
  const total = rows.reduce((acc, r) => acc + r.value, 0) || 1;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.name} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{r.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {count.format(r.value)} · {pct.format(r.value / total)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.value / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

export function WishlistDashboard({ data }: { data: WishlistStats | null }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">Wishlist stats are unavailable right now.</p>;
  }

  const { totals, active, events } = data;
  // Trim the empty run-up before launch so the charts start where activity does.
  const firstActive = data.daily.findIndex((d) => d.visitors > 0 || d.items > 0);
  const daily = firstActive > 0 ? data.daily.slice(firstActive) : data.daily;
  const wauByDay = new Map((data.wau_series ?? []).map((d) => [d.day, d.wau]));
  const activeSeries = daily.map((d) => ({ day: d.day, active: d.active, wau: wauByDay.get(d.day) ?? 0 }));
  const updated = new Date(data.generated_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Totals come from the wishlist database. Activity comes from PostHog (tracked since{" "}
        {shortDate(data.tracking_since)}). Active users are signed-in people. Updated {updated}.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Signed up" value={count.format(totals.users)} />
        <Stat label="Weekly active" value={count.format(active.wau)} detail={`${count.format(active.dau)} today · ${count.format(active.mau)} in 30 days`} />
        <Stat label="Wishlists" value={count.format(totals.lists)} detail={`${count.format(totals.kid_lists)} for kids`} />
        <Stat label="Items on lists" value={count.format(totals.items)} detail={`${pct.format(totals.items ? totals.link_items / totals.items : 0)} are links`} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Activation"
          value={pct.format(totals.users ? totals.activated_users / totals.users : 0)}
          detail={`${count.format(totals.activated_users)} of ${count.format(totals.users)} added an item`}
        />
        <Stat label="Exchanges" value={count.format(totals.exchanges)} detail={`${count.format(totals.exchange_members)} members · ${count.format(totals.exchanges_drawn)} names drawn`} />
        <Stat label="Gifts claimed" value={count.format(totals.gifts_claimed)} />
        <Stat label="Visitors (7 days)" value={count.format(active.visitors_7d)} detail="Signed in or not" />
      </div>

      <Card title="Active users (UTC)">
        <ChartContainer config={activeConfig} className="aspect-auto h-[240px] w-full">
          <AreaChart data={activeSeries} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="day" {...axisProps} minTickGap={24} tickFormatter={shortDate} />
            <YAxis {...axisProps} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
            <ChartLegend content={<ChartLegendContent />} />
            {data.wau_series && (
              <Area dataKey="wau" type="monotone" fill="var(--color-wau)" fillOpacity={0.2} stroke="var(--color-wau)" />
            )}
            <Area dataKey="active" type="monotone" fill="var(--color-active)" fillOpacity={0.3} stroke="var(--color-active)" />
          </AreaChart>
        </ChartContainer>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Sign-ups and items added per day">
          <ChartContainer config={growthConfig} className="aspect-auto h-[220px] w-full">
            <BarChart data={daily} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.4} />
              <XAxis dataKey="day" {...axisProps} minTickGap={24} tickFormatter={shortDate} />
              <YAxis {...axisProps} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="signups" fill="var(--color-signups)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="items" fill="var(--color-items)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Card>

        <Card title="Exchange activity per day">
          <ChartContainer config={exchangeConfig} className="aspect-auto h-[220px] w-full">
            <BarChart data={daily} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.4} />
              <XAxis dataKey="day" {...axisProps} minTickGap={24} tickFormatter={shortDate} />
              <YAxis {...axisProps} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="exchanges_created" stackId="x" fill="var(--color-exchanges_created)" />
              <Bar dataKey="exchange_joins" stackId="x" fill="var(--color-exchange_joins)" />
              <Bar dataKey="gifts_claimed" stackId="x" fill="var(--color-gifts_claimed)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Items added by platform">
          <Breakdown rows={data.items_by_platform.map((p) => ({ name: p.name, value: p.items }))} />
        </Card>
        <Card title="Active users by device (30 days)">
          <Breakdown rows={data.devices_30d.map((d) => ({ name: d.name, value: d.users }))} />
        </Card>
        <Card title="Since tracking began">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Items added", events.items_added],
              ["…for kids", events.kid_items_added],
              ["Exchanges created", events.exchanges_created],
              ["Exchange joins", events.exchange_joins],
              ["Names drawn", events.names_drawn],
              ["Gifts claimed", events.gifts_claimed],
              ["Notes left", events.notes],
              ["Push turned on", events.push_enabled],
            ].map(([label, value]) => (
              <div key={label as string} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right tabular-nums">{count.format(value as number)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
