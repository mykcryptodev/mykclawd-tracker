import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function colorClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

interface Props {
  totalValueUsd: number;
  totalRealizedUsd: number;
  totalUnrealizedUsd: number;
}

export function PnlSummary({
  totalValueUsd,
  totalRealizedUsd,
  totalUnrealizedUsd,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{usd(totalValueUsd)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unrealized PnL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${colorClass(totalUnrealizedUsd)}`}>
            {usd(totalUnrealizedUsd)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Realized PnL
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${colorClass(totalRealizedUsd)}`}>
            {usd(totalRealizedUsd)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
