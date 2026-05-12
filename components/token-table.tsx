"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Blobbie } from "thirdweb/react";

interface Position {
  contractAddress: string;
  symbol: string;
  isPriced: boolean;
  quantity: number;
  avgCostUsd: number;
  currentPriceUsd: number;
  valueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  percentageOfPortfolio: number;
  imageUrl: string | null;
  imageChecked: boolean;
}

type SortKey = keyof Pick<
  Position,
  "valueUsd" | "unrealizedPnlUsd" | "realizedPnlUsd" | "percentageOfPortfolio"
>;

function usd(n: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 4,
  }).format(n);
}

function pnlClass(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}

interface Props {
  positions: Position[];
  trackedAddress: string;
}

export function TokenTable({ positions, trackedAddress }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("valueUsd");
  const [asc, setAsc] = useState(false);
  const [showZero, setShowZero] = useState(false);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(false);
    }
  }

  // Compact formatter uses 1 decimal place, so anything < $0.05 rounds to "$0.0".
  // Collapse those alongside true zeros.
  const active = positions.filter((p) => p.valueUsd >= 0.05);
  const zero = positions.filter((p) => p.valueUsd < 0.05);

  const pricedActive = active.filter((p) => p.isPriced);
  const unpricedActive = active.filter((p) => !p.isPriced);

  const sortedActive = [...pricedActive].sort((a, b) =>
    asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
  );

  const visibleRows = [...sortedActive, ...unpricedActive];

  // Zero-balance rows sorted by realized PnL descending (closed positions)
  const zeroRows = [...zero].sort(
    (a, b) => b.realizedPnlUsd - a.realizedPnlUsd
  );

  function ColHead({ label, k }: { label: string; k?: SortKey }) {
    return (
      <TableHead
        className={k ? "cursor-pointer select-none" : ""}
        onClick={k ? () => toggleSort(k) : undefined}
      >
        {label}
        {k && sortKey === k && (asc ? " ↑" : " ↓")}
      </TableHead>
    );
  }

  function PositionRow({ p }: { p: Position }) {
    return (
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() =>
          window.open(
            `https://basescan.org/token/${p.contractAddress}?a=${trackedAddress}`,
            "_blank",
            "noopener,noreferrer"
          )
        }
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                className="size-5 rounded-full shrink-0 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Blobbie address={p.contractAddress} size={20} className="rounded-full shrink-0" />
            )}
            <span>{p.symbol || p.contractAddress.slice(0, 8)}</span>
            {!p.isPriced && (
              <Badge variant="secondary" className="text-xs">
                unpriced
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{p.quantity.toFixed(4)}</TableCell>
        <TableCell>{p.isPriced ? usd(p.avgCostUsd, false) : "—"}</TableCell>
        <TableCell>{p.isPriced ? usd(p.currentPriceUsd, false) : "—"}</TableCell>
        <TableCell>{p.isPriced ? usd(p.valueUsd, true) : "—"}</TableCell>
        <TableCell className={pnlClass(p.unrealizedPnlUsd)}>
          {p.isPriced ? usd(p.unrealizedPnlUsd, true) : "—"}
        </TableCell>
        <TableCell className={pnlClass(p.realizedPnlUsd)}>
          {p.isPriced ? usd(p.realizedPnlUsd, true) : "—"}
        </TableCell>
        <TableCell>
          {p.isPriced ? `${p.percentageOfPortfolio.toFixed(1)}%` : "—"}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <ColHead label="Token" />
          <ColHead label="Qty" />
          <ColHead label="Avg Cost" />
          <ColHead label="Price" />
          <ColHead label="Value" k="valueUsd" />
          <ColHead label="Unrealized" k="unrealizedPnlUsd" />
          <ColHead label="Realized" k="realizedPnlUsd" />
          <ColHead label="%" k="percentageOfPortfolio" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.length === 0 && zeroRows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={8}
              className="text-center text-muted-foreground py-8"
            >
              No positions yet — run Sync to load data.
            </TableCell>
          </TableRow>
        )}

        {visibleRows.map((p) => (
          <PositionRow key={p.contractAddress} p={p} />
        ))}

        {zeroRows.length > 0 && (
          <TableRow
            className="cursor-pointer hover:bg-muted/50 text-muted-foreground"
            onClick={() => setShowZero((v) => !v)}
          >
            <TableCell colSpan={8}>
              <span className="flex items-center gap-1.5 text-xs font-medium select-none">
                {showZero ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                )}
                {zeroRows.length} closed / zero-balance{" "}
                {showZero ? "positions" : "positions hidden"}
              </span>
            </TableCell>
          </TableRow>
        )}

        {showZero &&
          zeroRows.map((p) => <PositionRow key={p.contractAddress} p={p} />)}
      </TableBody>
    </Table>
  );
}
