"use client";

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react";

interface Delta {
  abs: number;
  pct: number;
}

interface Props {
  totalUsd: number;
  deltas: {
    d1: Delta | null;
    d7: Delta | null;
    d30: Delta | null;
  };
}

const navFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function pctClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function Indicator({ value }: { value: number }) {
  if (value > 0)
    return <TrendingUpIcon className="size-3.5 text-green-600 dark:text-green-400 shrink-0" />;
  if (value < 0)
    return <TrendingDownIcon className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />;
  return null;
}

function signedUsd(n: number) {
  return `${n >= 0 ? "+" : "−"}${compactUsd.format(Math.abs(n))}`;
}

function signedPct(n: number) {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}

function PerfCard({ label, delta }: { label: string; delta: Delta | null }) {
  return (
    <Card className="@container/card border-border/60">
      <CardHeader className="gap-3">
        <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
          {label}
        </CardDescription>
        <CardTitle
          className={`text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl ${
            delta ? pctClass(delta.pct) : ""
          }`}
        >
          {delta ? signedPct(delta.pct) : "—"}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex items-center gap-1.5">
        {delta ? (
          <>
            <Indicator value={delta.abs} />
            <span className={`font-mono text-[11px] ${pctClass(delta.abs)}`}>
              {signedUsd(delta.abs)}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not enough history yet</span>
        )}
      </CardFooter>
    </Card>
  );
}

export function NavCards({ totalUsd, deltas }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
            Net Asset Value
          </CardDescription>
          <CardTitle className="text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl">
            {navFormatter.format(totalUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            Base · all token holdings incl. native ETH
          </span>
        </CardFooter>
      </Card>

      <PerfCard label="24h Change" delta={deltas.d1} />
      <PerfCard label="7-Day Change" delta={deltas.d7} />
      <PerfCard label="30-Day Change" delta={deltas.d30} />
    </div>
  );
}
