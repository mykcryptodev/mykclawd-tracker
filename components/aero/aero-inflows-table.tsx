"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AeroLatest } from "./aero-types";

function fmtTs(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export function AeroInflowsTable({ latest }: { latest: AeroLatest }) {
  const list = latest.inflows.list;
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>External capital inflows during window</CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground">No external inflows — starting balance only.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (UTC)</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r, i) => (
                <TableRow key={`${r.tx}-${i}`}>
                  <TableCell className="text-xs">{fmtTs(r.ts)}</TableCell>
                  <TableCell className="text-xs">{r.sym}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.amount.toFixed(8)}</TableCell>
                  <TableCell className="text-xs font-mono">{r.from}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
