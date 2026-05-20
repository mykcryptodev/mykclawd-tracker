"use client"

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react"

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n)
}

interface Props {
  totalValueUsd: number
  totalRealizedUsd: number
  totalUnrealizedUsd: number
  inferenceSpendUsd: number
  siAllowanceUsd: number
}

function pnlClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400"
  if (n < 0) return "text-red-600 dark:text-red-400"
  return ""
}

function PnlIndicator({ value }: { value: number }) {
  if (value > 0)
    return <TrendingUpIcon className="size-3.5 text-green-600 dark:text-green-400 shrink-0" />
  if (value < 0)
    return <TrendingDownIcon className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />
  return null
}

export function SectionCards({
  totalValueUsd,
  totalRealizedUsd,
  totalUnrealizedUsd,
  inferenceSpendUsd,
  siAllowanceUsd,
}: Props) {
  const totalPnl = totalRealizedUsd + totalUnrealizedUsd

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @4xl/main:grid-cols-4">
      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
            Portfolio Value
          </CardDescription>
          <CardTitle className="text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl">
            {usd(totalValueUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <PnlIndicator value={totalPnl} />
          <span className={`font-mono text-[11px] ${pnlClass(totalPnl)}`}>
            {totalPnl >= 0 ? "+" : ""}{usd(totalPnl)} total PnL
          </span>
          <span className="text-[11px] text-muted-foreground">· Base · 365d</span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
            Unrealized PnL
          </CardDescription>
          <CardTitle
            className={`text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl ${pnlClass(totalUnrealizedUsd)}`}
          >
            {usd(totalUnrealizedUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <PnlIndicator value={totalUnrealizedUsd} />
          <span className="text-[11px] text-muted-foreground">Open positions · mark-to-market</span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
            Realized PnL
          </CardDescription>
          <CardTitle
            className={`text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl ${pnlClass(totalRealizedUsd)}`}
          >
            {usd(totalRealizedUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <PnlIndicator value={totalRealizedUsd} />
          <span className="text-[11px] text-muted-foreground">Closed positions · weighted avg cost</span>
        </CardFooter>
      </Card>

      <Card className="@container/card border-border/60">
        <CardHeader className="gap-3">
          <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
            Inference Spend
          </CardDescription>
          <CardTitle className="text-4xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight @[250px]/card:text-5xl text-black dark:text-white">
            {usd(inferenceSpendUsd)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Surplus Intelligence · USDC</span>
          {siAllowanceUsd > 0 && (
            <span className="text-[11px] text-muted-foreground">· {usd(siAllowanceUsd)} approved</span>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
