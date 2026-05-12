"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AeroLatest, AeroPosition } from "./aero-types";

function fmtN(n: number, d: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
}
function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function PositionRow({ p, latest }: { p: AeroPosition; latest: AeroLatest }) {
  const a0 = Number(BigInt(p.a0)) / 10 ** latest.dec0;
  const a1 = Number(BigInt(p.a1)) / 10 ** latest.dec1;
  const earned = Number(BigInt(p.earned)) / 1e18;
  const inRange = p.curTick >= p.tickLower && p.curTick <= p.tickUpper;
  const width = p.tickUpper - p.tickLower;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 py-3 border-b border-border/40 last:border-0">
      <div>
        <Row label="Token ID" value={<span className="font-mono">#{p.tokenId}</span>} />
        <Row label="Range (ticks)" value={`[${p.tickLower}, ${p.tickUpper}]`} />
        <Row label="Width" value={`${width} ticks (~${(width * 0.01).toFixed(2)}%)`} />
        <Row label="Current tick" value={
          <span className="inline-flex items-center gap-2">
            {p.curTick}
            <Badge variant={inRange ? "default" : "secondary"} className={inRange ? "bg-green-600/15 text-green-700 dark:text-green-400 border-green-700/30" : "bg-amber-600/15 text-amber-700 dark:text-amber-400 border-amber-700/30"}>
              {inRange ? "IN RANGE" : "OUT OF RANGE"}
            </Badge>
          </span>
        } />
      </div>
      <div>
        <Row label={`${latest.sym0} in position`} value={`${fmtN(a0, 6)} (${usd(a0 * latest.prices.p0Now)})`} />
        <Row label={`${latest.sym1} in position`} value={`${fmtN(a1, 8)} (${usd(a1 * latest.prices.p1Now)})`} />
        <Row label="Pending AERO" value={`${fmtN(earned, 4)} (${usd(earned * latest.prices.paNow)})`} />
        <Row label="Liquidity (L)" value={Number(p.liquidity).toLocaleString()} />
      </div>
    </div>
  );
}

export function AeroPositionCard({ latest }: { latest: AeroLatest }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Active LP position{latest.positions.length > 1 ? "s" : ""} ({latest.sym0}/{latest.sym1})</CardTitle>
      </CardHeader>
      <CardContent>
        {latest.positions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No staked positions.</div>
        ) : (
          latest.positions.map((p) => <PositionRow key={p.tokenId} p={p} latest={latest} />)
        )}
      </CardContent>
    </Card>
  );
}
