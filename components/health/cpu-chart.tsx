"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  model: string;
  cores: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
}

const chartConfig = {
  load1m: { label: "1 min avg", color: "var(--chart-1)" },
  load5m: { label: "5 min avg", color: "var(--chart-2)" },
  load15m: { label: "15 min avg", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CpuChart({ model, cores, loadAvg1m, loadAvg5m, loadAvg15m }: Props) {
  const toPercent = (v: number) => Math.min(100, (v / cores) * 100);

  // Outermost → innermost: 1m, 5m, 15m
  const data = [
    { name: "1m", value: toPercent(loadAvg1m), fill: "var(--chart-1)" },
    { name: "5m", value: toPercent(loadAvg5m), fill: "var(--chart-2)" },
    { name: "15m", value: toPercent(loadAvg15m), fill: "var(--chart-3)" },
  ];

  function loadColor(pct: number) {
    if (pct > 90) return "text-red-500";
    if (pct > 70) return "text-yellow-500";
    return "text-green-500";
  }

  const pct1 = toPercent(loadAvg1m);
  const pct5 = toPercent(loadAvg5m);
  const pct15 = toPercent(loadAvg15m);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          CPU
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Radial rings */}
          <ChartContainer config={chartConfig} className="h-36 w-36 shrink-0">
            <RadialBarChart
              data={data}
              innerRadius="30%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                background={{ fill: "hsl(var(--muted))" }}
                cornerRadius={3}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => {
                      const raw =
                        name === "1m"
                          ? loadAvg1m
                          : name === "5m"
                          ? loadAvg5m
                          : loadAvg15m;
                      return [
                        `${(value as number).toFixed(1)}% (${raw.toFixed(2)})`,
                        name === "1m"
                          ? "1 min avg"
                          : name === "5m"
                          ? "5 min avg"
                          : "15 min avg",
                      ];
                    }}
                  />
                }
              />
            </RadialBarChart>
          </ChartContainer>

          {/* Stats */}
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            {/* Load rows */}
            {(
              [
                { label: "1 min", raw: loadAvg1m, pct: pct1, color: "bg-[var(--chart-1)]" },
                { label: "5 min", raw: loadAvg5m, pct: pct5, color: "bg-[var(--chart-2)]" },
                { label: "15 min", raw: loadAvg15m, pct: pct15, color: "bg-[var(--chart-3)]" },
              ] as const
            ).map(({ label, raw, pct, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${color}`} />
                <span className="text-xs text-muted-foreground w-10 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : color
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs font-mono tabular-nums w-10 text-right ${loadColor(pct)}`}>
                  {raw.toFixed(2)}
                </span>
              </div>
            ))}

            {/* Divider + meta */}
            <div className="pt-1 border-t border-border/40 flex flex-col gap-1">
              <p className="text-[11px] text-muted-foreground truncate" title={model}>
                {model}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {cores} cores · load avg (/ {cores} cores = 100%)
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
