"use client";

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react";
import type { AeroLatest } from "./aero-types";

function usd(n: number, opts?: { compact?: boolean }) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    notation: opts?.compact ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(n);
}

function pnlClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function PnlIndicator({ value }: { value: number }) {
  if (value > 0) return <TrendingUpIcon className="size-3.5 text-green-600 dark:text-green-400 shrink-0" />;
  if (value < 0) return <TrendingDownIcon className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />;
  return null;
}

export function AeroSummaryCards({ latest }: { latest: AeroLatest }) {
  const { usd: u, days } = latest;
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-4">
      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">Strategy value</CardDescription>
          <CardTitle className="text-3xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-4xl">
            {usd(u.stratUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            from {usd(u.startUsd)} deployed
          </span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">HODL baseline</CardDescription>
          <CardTitle className="text-3xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-4xl">
            {usd(u.hodlUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">if you&apos;d just held the same tokens</span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">Δ vs HODL</CardDescription>
          <CardTitle className={`text-3xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-4xl ${pnlClass(u.deltaUsd)}`}>
            {u.deltaUsd >= 0 ? "+" : ""}{usd(u.deltaUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <PnlIndicator value={u.deltaUsd} />
          <span className={`font-mono text-[11px] ${pnlClass(u.deltaUsd)}`}>
            {u.deltaPct >= 0 ? "+" : ""}{u.deltaPct.toFixed(2)}% in {days.toFixed(2)}d
          </span>
          <span className="text-[11px] text-muted-foreground">· ~{u.apr.toFixed(0)}% APR</span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">Gas paid</CardDescription>
          <CardTitle className="text-3xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-4xl">
            {usd(u.totalGasUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {latest.gasTxsCounted} txs · {u.totalGasEth.toFixed(8)} ETH
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
