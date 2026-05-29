"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Blobbie } from "thirdweb/react";

interface Position {
  tokenAddress: string;
  symbol: string;
  name: string;
  network: string;
  imgUrl: string | null;
  price: number | null;
  balance: number;
  balanceUsd: number;
  pctOfNav: number;
}

interface Props {
  positions: Position[];
  trackedAddress: string;
}

type SortKey = "balanceUsd" | "balance" | "pctOfNav";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

function fmtPrice(p: number | null): string {
  if (p === null || p === 0) return "—";
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  if (p >= 0.000001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(2)}`;
}

function basescanUrl(tokenAddress: string, owner: string): string {
  return tokenAddress === ZERO_ADDRESS
    ? `https://basescan.org/address/${owner}`
    : `https://basescan.org/token/${tokenAddress}?a=${owner}`;
}

function ColHead({
  label,
  k,
  align = "left",
  sortKey,
  asc,
  onSort,
}: {
  label: string;
  k?: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className={`${k ? "cursor-pointer select-none" : ""} ${align === "right" ? "text-right" : ""}`}
      onClick={k ? () => onSort(k) : undefined}
    >
      {label}
      {k && sortKey === k && (asc ? " ↑" : " ↓")}
    </TableHead>
  );
}

export function HoldingsTable({ positions, trackedAddress }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("balanceUsd");
  const [asc, setAsc] = useState(false);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) setAsc((v) => !v);
      else {
        setSortKey(key);
        setAsc(false);
      }
    },
    [sortKey]
  );

  const rows = useMemo(
    () =>
      [...positions].sort((a, b) =>
        asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
      ),
    [positions, sortKey, asc]
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <ColHead label="Token" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Price" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Balance" k="balance" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Value" k="balanceUsd" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="% NAV" k="pctOfNav" align="right" sortKey={sortKey} asc={asc} onSort={toggleSort} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No holdings yet — run Sync to load data.
            </TableCell>
          </TableRow>
        )}

        {rows.map((p) => (
          <TableRow
            key={p.tokenAddress}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() =>
              window.open(
                basescanUrl(p.tokenAddress, trackedAddress),
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {p.imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imgUrl}
                    alt=""
                    className="size-5 rounded-full shrink-0 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Blobbie address={p.tokenAddress} size={20} className="rounded-full shrink-0" />
                )}
                <span>{p.symbol || p.tokenAddress.slice(0, 8)}</span>
                {p.name && p.name !== p.symbol && (
                  <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[160px]">
                    {p.name}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtPrice(p.price)}</TableCell>
            <TableCell className="text-right tabular-nums">{qtyFormatter.format(p.balance)}</TableCell>
            <TableCell className="text-right tabular-nums">{fullUsd.format(p.balanceUsd)}</TableCell>
            <TableCell className="text-right tabular-nums">{p.pctOfNav.toFixed(1)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
