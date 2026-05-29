import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  balance: number;
  usd: number;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function EthBalanceCard({ balance, usd }: Props) {
  return (
    <Card className="@container/card border-dashed border-border/60">
      <CardHeader className="gap-3">
        <CardDescription className="text-[11px] uppercase tracking-widest font-medium">
          Native ETH
        </CardDescription>
        <CardTitle className="text-3xl font-[family-name:var(--font-segment)] font-bold tabular-nums tracking-tight">
          {balance.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1">
        <span className="font-mono text-sm tabular-nums">{usdFormatter.format(usd)}</span>
        <span className="text-[11px] text-muted-foreground">
          Excluded from NAV &amp; performance — held for gas
        </span>
      </CardFooter>
    </Card>
  );
}
