"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react"

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
}

function TrendBadge({ value }: { value: number }) {
  if (value > 0)
    return (
      <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-600/30">
        <TrendingUpIcon />
        {usd(value)}
      </Badge>
    )
  if (value < 0)
    return (
      <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-600/30">
        <TrendingDownIcon />
        {usd(value)}
      </Badge>
    )
  return (
    <Badge variant="outline">
      <MinusIcon />
      {usd(value)}
    </Badge>
  )
}

function pnlClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400"
  if (n < 0) return "text-red-600 dark:text-red-400"
  return ""
}

export function SectionCards({
  totalValueUsd,
  totalRealizedUsd,
  totalUnrealizedUsd,
}: Props) {
  const totalPnl = totalRealizedUsd + totalUnrealizedUsd

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Portfolio Value</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {usd(totalValueUsd)}
          </CardTitle>
          <CardAction>
            <TrendBadge value={totalPnl} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalPnl >= 0 ? "Total PnL positive" : "Total PnL negative"}{" "}
            {totalPnl >= 0 ? (
              <TrendingUpIcon className="size-4" />
            ) : (
              <TrendingDownIcon className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">Base network · 365-day window</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Unrealized PnL</CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${pnlClass(totalUnrealizedUsd)}`}
          >
            {usd(totalUnrealizedUsd)}
          </CardTitle>
          <CardAction>
            <TrendBadge value={totalUnrealizedUsd} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Open positions</div>
          <div className="text-muted-foreground">Mark-to-market at current prices</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Realized PnL</CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${pnlClass(totalRealizedUsd)}`}
          >
            {usd(totalRealizedUsd)}
          </CardTitle>
          <CardAction>
            <TrendBadge value={totalRealizedUsd} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Closed positions</div>
          <div className="text-muted-foreground">Weighted average cost basis</div>
        </CardFooter>
      </Card>
    </div>
  )
}
