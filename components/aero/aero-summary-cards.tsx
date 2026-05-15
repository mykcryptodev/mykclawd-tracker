"use client";

import React from "react";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUpIcon, TrendingDownIcon, ShieldCheckIcon, ShieldAlertIcon, ShieldXIcon } from "lucide-react";
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
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-4 @xl/main:grid-rows-[auto_auto]">
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

      <AeroHealthCard latest={latest} />
    </div>
  );
}

function coverageLabel(ratio: number): { label: string; cls: string; icon: React.ReactNode } {
  if (ratio >= 99) return { label: "LP profitable", cls: "text-green-600 dark:text-green-400", icon: <ShieldCheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" /> };
  if (ratio >= 1.2) return { label: "Rewards winning", cls: "text-green-600 dark:text-green-400", icon: <ShieldCheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" /> };
  if (ratio >= 0.7) return { label: "Watch closely", cls: "text-yellow-600 dark:text-yellow-400", icon: <ShieldAlertIcon className="size-3.5 shrink-0 text-yellow-600 dark:text-yellow-400" /> };
  return { label: "Consider exiting", cls: "text-red-600 dark:text-red-400", icon: <ShieldXIcon className="size-3.5 shrink-0 text-red-600 dark:text-red-400" /> };
}

function AeroHealthCard({ latest }: { latest: AeroLatest }) {
  const { health, usd: u } = latest;
  const { label, cls, icon } = coverageLabel(health.coverageRatio);
  const coverageDisplay = health.coverageRatio >= 99 ? "∞" : health.coverageRatio.toFixed(2);
  return (
    <Card className="@container/card border-border/60 lg:col-span-4">
      <CardHeader className="gap-3">
        <CardDescription className="text-[11px] uppercase tracking-widest font-medium">LP health</CardDescription>
        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">Net benefit</div>
            <span className={`text-xl font-[family-name:var(--font-segment)] font-bold tabular-nums ${pnlClass(health.netBenefitUsd)}`}>
              {health.netBenefitUsd >= 0 ? "+" : ""}{usd(health.netBenefitUsd)}
            </span>
            <span className={`ml-1 text-xs ${pnlClass(health.netBenefitPct)}`}>({health.netBenefitPct >= 0 ? "+" : ""}{health.netBenefitPct.toFixed(2)}%)</span>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">Coverage ratio</div>
            <span className={`text-xl font-[family-name:var(--font-segment)] font-bold tabular-nums ${cls}`}>
              {coverageDisplay}x
            </span>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">AERO rewards</div>
            <span className="text-xl font-[family-name:var(--font-segment)] font-bold tabular-nums text-green-600 dark:text-green-400">
              +{usd(u.aeroAddedUsd)}
            </span>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-0.5">LP drag (IL)</div>
            <span className={`text-xl font-[family-name:var(--font-segment)] font-bold tabular-nums ${pnlClass(u.lpOnlyDelta)}`}>
              {u.lpOnlyDelta >= 0 ? "+" : ""}{usd(u.lpOnlyDelta)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex items-center gap-1.5">
        {icon}
        <span className={`text-[11px] font-medium ${cls}`}>{label}</span>
        <span className="text-[11px] text-muted-foreground">· exit if coverage &lt; 0.3x or net benefit &lt; −5% of start</span>
      </CardFooter>
    </Card>
  );
}
