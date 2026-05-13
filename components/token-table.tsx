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

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function usd(n: number, compact = false) {
  return compact ? compactUsdFormatter.format(n) : usdFormatter.format(n);
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

function ColHead({
  label,
  k,
  sortKey,
  asc,
  onSort,
}: {
  label: string;
  k?: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className={k ? "cursor-pointer select-none" : ""}
      onClick={k ? () => onSort(k) : undefined}
    >
      {label}
      {k && sortKey === k && (asc ? " ↑" : " ↓")}
    </TableHead>
  );
}

function PositionRow({
  p,
  trackedAddress,
}: {
  p: Position;
  trackedAddress: string;
}) {
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

export function TokenTable({ positions, trackedAddress }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("valueUsd");
  const [asc, setAsc] = useState(false);
  const [showZero, setShowZero] = useState(false);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(false);
    }
  }, [asc, sortKey]);

  // Compact formatter uses 1 decimal place, so anything < $0.05 rounds to "$0.0".
  // Collapse those alongside true zeros.
  const { visibleRows, zeroRows } = useMemo(() => {
    const active = positions.filter((p) => p.valueUsd >= 0.05);
    const zero = positions.filter((p) => p.valueUsd < 0.05);

    const pricedActive = active.filter((p) => p.isPriced);
    const unpricedActive = active.filter((p) => !p.isPriced);

    const sortedActive = [...pricedActive].sort((a, b) =>
      asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
    );

    const sortedZero = [...zero].sort((a, b) =>
      asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
    );

    return {
      visibleRows: [...sortedActive, ...unpricedActive],
      zeroRows: sortedZero,
    };
  }, [asc, positions, sortKey]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <ColHead label="Token" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Qty" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Avg Cost" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Price" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Value" k="valueUsd" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Unrealized" k="unrealizedPnlUsd" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="Realized" k="realizedPnlUsd" sortKey={sortKey} asc={asc} onSort={toggleSort} />
          <ColHead label="%" k="percentageOfPortfolio" sortKey={sortKey} asc={asc} onSort={toggleSort} />
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
          <PositionRow key={p.contractAddress} p={p} trackedAddress={trackedAddress} />
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
          zeroRows.map((p) => (
            <PositionRow key={p.contractAddress} p={p} trackedAddress={trackedAddress} />
          ))}
      </TableBody>
    </Table>
  );
}
