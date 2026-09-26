"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  LineChart, Line, Legend,
} from "recharts";

// bankr has been down since May 19 2026 9:00 AM EDT — shade this on all timeseries
const BANKR_DOWN_TS = Math.floor(new Date("2026-05-19T09:00:00-04:00").getTime() / 1000);
// bankr overlay ends May 27 2026 midnight New York time (i.e. end of May 26 / start of May 27)
const BANKR_END_TS = Math.floor(new Date("2026-05-27T00:00:00-04:00").getTime() / 1000);
// Bright red-400 (#f87171) — visible on both light and dark backgrounds
const BANKR_FILL = "#f87171";
const BANKR_FILL_OPACITY = 0.18;
// Labels for the first/last points inside the outage, or null when the window doesn't overlap it
// (e.g. a price series that starts after May 27 must not be shaded end to end).
function bankrSpan(points: { ts: number }[], labels: string[]) {
  const first = points.findIndex((p) => p.ts >= BANKR_DOWN_TS);
  let last = -1;
  for (let i = points.length - 1; i >= 0; i--) if (points[i].ts <= BANKR_END_TS) { last = i; break; }
  if (first < 0 || last < first) return null;
  return { x1: labels[first], x2: labels[last] };
}
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AeroLatest, AeroHistoryPoint } from "./aero-types";
import type { AeroPricePoint } from "@/lib/aero-price";

function usdShort(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function usdFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function tsShort(ts: number) {
  return new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Synthetic (backfilled) rows model LP impermanent loss as 0, so strategy ≥ HODL by
// construction there. Shade that span so it isn't read as real outperformance.
const EST_FILL = "#a1a1aa";
const EST_FILL_OPACITY = 0.14;
function estimatedSpan(history: AeroHistoryPoint[], labels: string[]) {
  const first = history.findIndex((h) => h.synthetic);
  if (first < 0) return null;
  let last = first;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].synthetic) { last = i; break; }
  return { x1: labels[first], x2: labels[last], count: last - first + 1 };
}
function snapshotCountLabel(history: AeroHistoryPoint[]) {
  const est = history.filter((h) => h.synthetic).length;
  const live = history.length - est;
  return est > 0 ? `${live} live · ${est} estimated` : `${live} snapshots`;
}

// ───── Trend over time (strategy vs HODL) ─────
export function AeroTrendChart({ history }: { history: AeroHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <Card className="border-border/60">
        <CardHeader><CardTitle>Performance over time</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Need ≥2 snapshots — re-run sync to add another.
        </CardContent>
      </Card>
    );
  }
  const data = history.map((h) => ({ label: tsShort(h.ts), strategy: h.stratUsd, hodl: h.hodlUsd }));
  const est = estimatedSpan(history, data.map((d) => d.label));
  const bankr = bankrSpan(history, data.map((d) => d.label));
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Performance over time ({snapshotCountLabel(history)})</CardTitle>
        {est && (
          <p className="text-sm text-muted-foreground">
            Shaded span is backfilled daily estimates: HODL is exact, strategy assumes zero LP drag (IL). Live snapshots start after it.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ strategy: { label: "Strategy", color: "var(--chart-1)" }, hodl: { label: "HODL", color: "var(--chart-3)" } }} className="h-72 w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => usdFull(Number(v))} />} />
            {est && (
              <ReferenceArea x1={est.x1} x2={est.x2} fill={EST_FILL} fillOpacity={EST_FILL_OPACITY} stroke={EST_FILL} strokeOpacity={0.4}
                label={{ value: "estimated (no IL)", position: "insideBottomLeft", fontSize: 10, fill: EST_FILL }} />
            )}
            {bankr && (
              <ReferenceArea x1={bankr.x1} x2={bankr.x2} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
                label={{ value: "bankr ⚠︎", position: "insideTopLeft", fontSize: 10, fill: BANKR_FILL }} />
            )}
            <Area type="monotone" dataKey="strategy" stroke="var(--color-strategy)" fill="var(--color-strategy)" fillOpacity={0.2} strokeWidth={2} />
            <Area type="monotone" dataKey="hodl" stroke="var(--color-hodl)" fill="var(--color-hodl)" fillOpacity={0.05} strokeWidth={2} strokeDasharray="5 5" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ───── Delta vs HODL over time ─────
export function AeroDeltaChart({ history }: { history: AeroHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <Card className="border-border/60">
        <CardHeader><CardTitle>Δ vs HODL over time</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Need ≥2 snapshots — re-run sync to add another.
        </CardContent>
      </Card>
    );
  }

  const data = history.map((h) => ({
    label: tsShort(h.ts),
    delta: h.deltaUsd,
    fill: h.deltaUsd >= 0 ? "var(--chart-1)" : "var(--destructive)",
  }));

  const absMax = Math.max(...data.map((d) => Math.abs(d.delta)), 0.01);
  const domain: [number, number] = [-absMax * 1.15, absMax * 1.15];

  const latest = data[data.length - 1];
  const sign = latest.delta >= 0 ? "+" : "";
  const subtitle = `Currently ${sign}${usdFull(latest.delta)} vs holding`;

  const est = estimatedSpan(history, data.map((d) => d.label));
  const bankr = bankrSpan(history, data.map((d) => d.label));

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Δ vs HODL over time</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ delta: { label: "Δ vs HODL", color: "var(--chart-1)" } }} className="h-72 w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} domain={domain} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            {est && (
              <ReferenceArea x1={est.x1} x2={est.x2} fill={EST_FILL} fillOpacity={EST_FILL_OPACITY} stroke={EST_FILL} strokeOpacity={0.4}
                label={{ value: "estimated (no IL)", position: "insideBottomLeft", fontSize: 10, fill: EST_FILL }} />
            )}
            {bankr && (
              <ReferenceArea x1={bankr.x1} x2={bankr.x2} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
                label={{ value: "bankr ⚠︎", position: "insideTopLeft", fontSize: 10, fill: BANKR_FILL }} />
            )}
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as { label: string; delta: number };
                const s = item.delta >= 0 ? "+" : "";
                return (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <div className="font-medium">{item.label}</div>
                    <div className={item.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      {s}{usdFull(item.delta)}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="delta" radius={[4, 4, 4, 4]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ───── Composition pie ─────
export function AeroCompositionChart({ latest }: { latest: AeroLatest }) {
  const { end, prices, sym0, sym1 } = latest;
  const posT0Usd = end.positionT0 * prices.p0Now;
  const posT1Usd = end.positionT1 * prices.p1Now;
  const aeroAllUsd = (end.walletAero + end.pendingAero) * prices.paNow;
  // walletEth (native ETH gas reserve) excluded — only WETH + cbBTC counted, matching stratUsd
  const walletUsd = end.walletT0 * prices.p0Now + end.walletT1 * prices.p1Now;

  const data = [
    { name: `LP ${sym0}`, value: posT0Usd },
    { name: `LP ${sym1}`, value: posT1Usd },
    { name: "AERO total", value: aeroAllUsd },
    { name: "Wallet", value: walletUsd },
  ].filter((d) => d.value > 0);

  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)"];

  return (
    <Card className="border-border/60">
      <CardHeader><CardTitle>Where the money is now</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-72 w-full">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={2}
              label={(p) => `${(((p.percent as number) ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Legend verticalAlign="bottom" height={28} iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
            <Tooltip formatter={(v) => usdFull(Number(v))} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ───── Strategy vs HODL bar ─────
export function AeroVsHodlChart({ latest }: { latest: AeroLatest }) {
  const data = [
    { name: "HODL", value: latest.usd.hodlUsd, color: "var(--muted-foreground)" },
    { name: "Strategy", value: latest.usd.stratUsd, color: latest.usd.deltaUsd >= 0 ? "var(--chart-1)" : "var(--destructive)" },
  ];
  return (
    <Card className="border-border/60">
      <CardHeader><CardTitle>Strategy vs HODL</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-72 w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            <Tooltip formatter={(v) => usdFull(Number(v))} cursor={{ fill: "transparent" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ───── AERO price over time ─────
export function AeroAeroPriceChart({ priceHistory, startTs }: { priceHistory: AeroPricePoint[]; startTs?: number }) {
  // Align start with the LP performance window
  const filteredHistory = startTs ? priceHistory.filter((p) => p.ts >= startTs) : priceHistory;
  if (filteredHistory.length < 2) {
    return (
      <Card className="border-border/60">
        <CardHeader><CardTitle>AERO price</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No price data available.
        </CardContent>
      </Card>
    );
  }

  const data = filteredHistory.map((p) => ({
    label: new Date(p.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: p.close,
  }));
  const bankr = bankrSpan(filteredHistory, data.map((d) => d.label));

  const currentPrice = data[data.length - 1].price;
  const startPrice = data[0].price;
  const changePct = ((currentPrice - startPrice) / startPrice) * 100;
  const positive = changePct >= 0;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>AERO price</CardTitle>
        <p className="text-sm text-muted-foreground">
          ${currentPrice.toFixed(4)}{" "}
          <span className={positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            ({positive ? "+" : ""}{changePct.toFixed(1)}% {data.length}d)
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ price: { label: "AERO", color: "var(--chart-4)" } }} className="h-72 w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.floor(data.length / 6)} />
            <YAxis
              tickFormatter={(v: number) => `$${v.toFixed(3)}`}
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as { label: string; price: number };
                return (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-muted-foreground">${item.price.toFixed(4)}</div>
                  </div>
                );
              }}
            />
            {bankr && (
              <ReferenceArea x1={bankr.x1} x2={bankr.x2} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
                label={{ value: "bankr ⚠︎", position: "insideTopLeft", fontSize: 10, fill: BANKR_FILL }} />
            )}
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--color-price)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ───── Waterfall decomposing Δ vs HODL ─────
export function AeroWaterfallChart({ latest }: { latest: AeroLatest }) {
  const { hodlUsd, aeroAddedUsd, lpOnlyDelta, stratUsd } = latest.usd;
  // Floating bars: [base, top] for each segment
  const fb = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
  const data = [
    { label: "HODL", range: fb(0, hodlUsd), color: "var(--muted-foreground)", delta: hodlUsd },
    { label: "+ AERO rewards", range: fb(hodlUsd, hodlUsd + aeroAddedUsd), color: "var(--chart-4)", delta: aeroAddedUsd },
    {
      label: lpOnlyDelta >= 0 ? "+ LP gains" : "− LP slippage / IL",
      range: fb(hodlUsd + aeroAddedUsd, hodlUsd + aeroAddedUsd + lpOnlyDelta),
      color: lpOnlyDelta >= 0 ? "var(--chart-1)" : "var(--destructive)",
      delta: lpOnlyDelta,
    },
    { label: "Strategy", range: fb(0, stratUsd), color: "var(--chart-1)", delta: stratUsd },
  ];

  return (
    <Card className="border-border/60">
      <CardHeader><CardTitle>Decomposing Δ vs HODL</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-80 w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "transparent" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as { label: string; delta: number };
                return (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-muted-foreground">{usdFull(item.delta)}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="range" radius={[6, 6, 6, 6]}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
