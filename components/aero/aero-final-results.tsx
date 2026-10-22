import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AERO_ENDED } from "@/lib/aero/constants";

export interface AeroFinalRow {
  address: string;
  label: string;
  ts: number;
  days: number;
  paNow: number;
  startUsd: number;
  stratUsd: number;
  hodlUsd: number;
  deltaUsd: number;
  aeroAddedUsd: number;
  lpOnlyDelta: number;
  totalGasUsd: number;
  txCount: number;
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function signed(n: number) {
  return `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
}

function pnlClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}

// AERO price at which the strategy would have exactly matched HODL. Only the AERO leg
// scales with price, so delta(p) = delta − aeroAdded · (1 − p / pa).
function breakevenAero(pa: number, deltaUsd: number, aeroAddedUsd: number) {
  if (aeroAddedUsd <= 0) return null;
  return Math.max(0, pa * (1 - deltaUsd / aeroAddedUsd));
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}

export function AeroFinalResults({ rows, selected }: { rows: AeroFinalRow[]; selected: string }) {
  const sum = (k: keyof AeroFinalRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const start = sum("startUsd"), strat = sum("stratUsd"), hodl = sum("hodlUsd"), delta = sum("deltaUsd");
  const aeroAdded = sum("aeroAddedUsd"), lpDrag = sum("lpOnlyDelta"), gas = sum("totalGasUsd"), txs = sum("txCount");
  const pa = rows[0]?.paNow ?? 0;
  const be = breakevenAero(pa, delta, aeroAdded);
  const ended = AERO_ENDED[selected];
  const endedDate = new Date((ended?.endedTs ?? rows[0].ts) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="px-4 lg:px-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">
            Strategy ended · {endedDate} · Aerodrome → Aero migration
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Aerodrome and Velodrome merged into Aero at 00:00 UTC on Oct 22, 2026, and every legacy gauge was
            deactivated, ending AERO emissions. All three rebalancers were unstaked, the liquidity was withdrawn,
            the accumulated AERO was upgraded 1:1 to the new AERO, and the rebalancer modules were detached from
            the Safes. Figures below are frozen at the last snapshot before the exit.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Deployed" value={usd(start)} />
            <Metric label="Final value" value={usd(strat)} />
            <Metric label="HODL baseline" value={usd(hodl)} />
            <Metric label="Δ vs HODL" value={`${signed(delta)} (${hodl > 0 ? ((delta / hodl) * 100).toFixed(1) : "0"}%)`} className={pnlClass(delta)} />
            <Metric label="AERO earned" value={signed(aeroAdded)} className={pnlClass(aeroAdded)} />
            <Metric label="LP drag (IL + rebalancing)" value={signed(lpDrag)} className={pnlClass(lpDrag)} />
            <Metric label="Gas" value={usd(gas)} />
            <Metric label="Transactions" value={txs.toLocaleString("en-US")} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault</TableHead>
                <TableHead className="text-right">Deployed</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead className="text-right">HODL</TableHead>
                <TableHead className="text-right">Δ vs HODL</TableHead>
                <TableHead className="text-right">AERO earned</TableHead>
                <TableHead className="text-right">LP drag</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Breakeven AERO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const b = breakevenAero(r.paNow, r.deltaUsd, r.aeroAddedUsd);
                return (
                  <TableRow key={r.address} className={r.address === selected ? "bg-muted/50" : undefined}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.startUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.stratUsd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.hodlUsd)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlClass(r.deltaUsd)}`}>{signed(r.deltaUsd)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlClass(r.aeroAddedUsd)}`}>{signed(r.aeroAddedUsd)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlClass(r.lpOnlyDelta)}`}>{signed(r.lpOnlyDelta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.days.toFixed(0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b === null ? "—" : `$${b.toFixed(2)}`}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground leading-relaxed">
            The strategy beat holding by converting LP value into AERO rewards, so most of the final value is AERO,
            valued at ${pa.toFixed(3)} at the final snapshot.
            {be !== null && <> The edge over HODL holds as long as AERO stays above roughly <strong>${be.toFixed(2)}</strong> (all three vaults combined).</>}
          </p>

          {ended && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              Exit transactions for this vault:{" "}
              {ended.txs.map((t, i) => (
                <span key={t.hash}>
                  {i > 0 && " · "}
                  <a className="underline underline-offset-2" href={`https://basescan.org/tx/${t.hash}`} target="_blank" rel="noreferrer">
                    {t.label}
                  </a>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
