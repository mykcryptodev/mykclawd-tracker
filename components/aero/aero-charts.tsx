"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  LineChart, Line,
} from "recharts";

// bankr has been down since May 19 2026 9:00 AM EDT — shade this on all timeseries
const BANKR_DOWN_TS = Math.floor(new Date("2026-05-19T09:00:00-04:00").getTime() / 1000);
// bankr overlay ends May 27 2026 midnight New York time (i.e. end of May 26 / start of May 27)
const BANKR_END_TS = Math.floor(new Date("2026-05-27T00:00:00-04:00").getTime() / 1000);
// Bright red-400 (#f87171) — visible on both light and dark backgrounds
const BANKR_FILL = "#f87171";
const BANKR_FILL_OPACITY = 0.18;
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
  const bankrIdx = history.findIndex((h) => h.ts >= BANKR_DOWN_TS);
  const bankrLabel = bankrIdx >= 0 ? data[bankrIdx].label : null;
  const bankrEndIdxT = [...history].map((h, i) => ({ ts: h.ts, i })).filter((x) => x.ts <= BANKR_END_TS).at(-1)?.i ?? history.length - 1;
  const bankrEndLabel = data[bankrEndIdxT]?.label ?? data.at(-1)?.label;
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Performance over time ({history.length} snapshots)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ strategy: { label: "Strategy", color: "var(--chart-1)" }, hodl: { label: "HODL", color: "var(--chart-3)" } }} className="h-72">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => usdFull(Number(v))} />} />
            {bankrLabel && bankrEndLabel && (
              <ReferenceArea x1={bankrLabel} x2={bankrEndLabel} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
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

  const bankrIdx = history.findIndex((h) => h.ts >= BANKR_DOWN_TS);
  const bankrLabel = bankrIdx >= 0 ? data[bankrIdx].label : null;
  const bankrEndIdxD = [...history].map((h, i) => ({ ts: h.ts, i })).filter((x) => x.ts <= BANKR_END_TS).at(-1)?.i ?? history.length - 1;
  const bankrEndLabelD = data[bankrEndIdxD]?.label ?? data.at(-1)?.label;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Δ vs HODL over time</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ delta: { label: "Δ vs HODL", color: "var(--chart-1)" } }} className="h-72">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={usdShort} tick={{ fontSize: 11 }} domain={domain} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            {bankrLabel && bankrEndLabelD && (
              <ReferenceArea x1={bankrLabel} x2={bankrEndLabelD} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
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
        <ChartContainer config={{}} className="h-72">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}
              label={(p) => `${p.name} ${(((p.percent as number) ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
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
        <ChartContainer config={{}} className="h-72">
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
export function AeroAeroPriceChart({ priceHistory }: { priceHistory: AeroPricePoint[] }) {
  if (priceHistory.length < 2) {
    return (
      <Card className="border-border/60">
        <CardHeader><CardTitle>AERO price</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No price data available.
        </CardContent>
      </Card>
    );
  }

  const data = priceHistory.map((p) => ({
    label: new Date(p.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: p.close,
  }));
  const bankrPriceIdx = priceHistory.findIndex((p) => p.ts >= BANKR_DOWN_TS);
  const bankrPriceLabel = bankrPriceIdx >= 0 ? data[bankrPriceIdx].label : null;
  const bankrPriceEndIdx = [...priceHistory].map((p, i) => ({ ts: p.ts, i })).filter((x) => x.ts <= BANKR_END_TS).at(-1)?.i ?? priceHistory.length - 1;
  const bankrPriceEndLabel = data[bankrPriceEndIdx]?.label ?? data.at(-1)?.label;

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
        <ChartContainer config={{ price: { label: "AERO", color: "var(--chart-4)" } }} className="h-72">
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
            {bankrPriceLabel && bankrPriceEndLabel && (
              <ReferenceArea x1={bankrPriceLabel} x2={bankrPriceEndLabel} fill={BANKR_FILL} fillOpacity={BANKR_FILL_OPACITY} stroke={BANKR_FILL} strokeOpacity={0.5}
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
        <ChartContainer config={{}} className="h-80">
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
