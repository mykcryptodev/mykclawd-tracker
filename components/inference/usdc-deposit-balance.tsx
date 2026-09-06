"use client";

import { useEffect, useRef, useState } from "react";

const USDC_DECIMALS = 6;
const TILE_H = 56;
const POLL_INTERVAL = 15_000;

interface BalanceResponse {
  availableUsdcMicro: string;
  heldUsdcMicro: string;
  creditBalanceUsdcMicro: string;
  pendingDepositUsdcMicro: string;
  depositAddress: string | null;
  accountStatus: string | null;
}

function formatUsdc(raw: bigint): string {
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = abs / divisor;
  const cents = abs % divisor;
  const centsStr = cents.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${centsStr}`;
}

// ---- Split-flap tile internals ----

function CharText({
  char,
  which,
}: {
  char: string;
  which: "top" | "bottom";
}) {
  return (
    <div
      className="absolute inset-x-0 flex items-center justify-center font-mono font-bold text-amber-300 tabular-nums"
      style={{
        height: `${TILE_H}px`,
        fontSize: `${Math.round(TILE_H * 0.52)}px`,
        lineHeight: 1,
        [which === "top" ? "top" : "bottom"]: 0,
      }}
    >
      {char}
    </div>
  );
}

function Half({ char, which }: { char: string; which: "top" | "bottom" }) {
  return (
    <div
      className={`absolute inset-x-0 overflow-hidden ${which === "top" ? "top-0" : "bottom-0"}`}
      style={{ height: "50%" }}
    >
      <CharText char={char} which={which} />
    </div>
  );
}

function SplitFlapChar({ char }: { char: string }) {
  const trackedRef = useRef(char);
  const [current, setCurrent] = useState(char);
  const [prev, setPrev] = useState(char);
  const [animKey, setAnimKey] = useState(0);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    const was = trackedRef.current;
    if (char === was) return;

    trackedRef.current = char;
    setPrev(was);
    setCurrent(char);
    setAnimKey((k) => k + 1);
    setFlipping(true);

    const t = setTimeout(() => setFlipping(false), 430);
    return () => clearTimeout(t);
  }, [char]);

  const isSep = char === "." || char === "," || char === "-";

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-sm"
      style={{
        width: isSep ? "0.875rem" : "2rem",
        height: `${TILE_H}px`,
        background: "rgb(24 24 27)", // zinc-900
        boxShadow: "0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Static background: always shows current char */}
      <Half char={current} which="top" />
      <Half char={current} which="bottom" />

      {/* Center gap / divider */}
      <div
        className="absolute inset-x-0 z-20 pointer-events-none"
        style={{ top: "calc(50% - 1px)", height: "2px", background: "rgba(0,0,0,0.55)" }}
      />

      {/* Animated flaps — remounted on each flip via key to restart CSS animation */}
      {flipping && (
        <>
          {/* Top flap: prev char's top half, folds down */}
          <div
            key={`t${animKey}`}
            className="absolute top-0 inset-x-0 z-10 overflow-hidden"
            style={{
              height: "50%",
              background: "rgb(24 24 27)",
              transformOrigin: "bottom center",
              backfaceVisibility: "hidden",
              animation: "sf-fold-out 190ms ease-in forwards",
            }}
          >
            <CharText char={prev} which="top" />
          </div>

          {/* Bottom flap: current char's bottom half, folds in from behind */}
          <div
            key={`b${animKey}`}
            className="absolute bottom-0 inset-x-0 z-10 overflow-hidden"
            style={{
              height: "50%",
              background: "rgb(24 24 27)",
              transformOrigin: "top center",
              backfaceVisibility: "hidden",
              animation: "sf-fold-in 190ms ease-out 160ms both",
            }}
          >
            <CharText char={current} which="bottom" />
          </div>
        </>
      )}
    </div>
  );
}

// ---- Main exported component ----

export function UsdcDepositBalance() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/inference/balance", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as BalanceResponse;
        if (cancelled) return;
        setData(json);
        setIsError(false);
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        setIsError(true);
        setIsLoading(false);
      }
    }

    load();
    const t = setInterval(load, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const formatted =
    data !== null ? formatUsdc(BigInt(data.availableUsdcMicro)) : null;
  const heldMicro = data !== null ? BigInt(data.heldUsdcMicro) : BigInt(0);
  const pendingDepositMicro =
    data !== null ? BigInt(data.pendingDepositUsdcMicro) : BigInt(0);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Surplus Intelligence Spendable Balance
        </p>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Live · Surplus API</span>
        </div>
      </div>

      {/* Display */}
      {isLoading && (
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-sm animate-pulse"
              style={{
                width: "2rem",
                height: `${TILE_H}px`,
                background: "rgb(24 24 27)",
              }}
            />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-muted-foreground">Failed to load balance</p>
      )}

      {!isLoading && !isError && formatted && (
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex items-center gap-0.5">
            {formatted.split("").map((c, i) => (
              <SplitFlapChar key={i} char={c} />
            ))}
          </div>
          <span className="text-sm font-medium text-muted-foreground pb-1">USDC</span>
        </div>
      )}

      {/* Sub-line: held + pending deposits */}
      {!isLoading && !isError && data && (heldMicro > BigInt(0) || pendingDepositMicro > BigInt(0)) && (
        <p className="mt-2 text-[11px] text-muted-foreground font-mono">
          {heldMicro > BigInt(0) && <>held: ${formatUsdc(heldMicro)}</>}
          {heldMicro > BigInt(0) && pendingDepositMicro > BigInt(0) && " · "}
          {pendingDepositMicro > BigInt(0) && <>deposit pending: ${formatUsdc(pendingDepositMicro)}</>}
        </p>
      )}

      {/* Deposit address link */}
      {data?.depositAddress && (
        <a
          href={`https://basescan.org/address/${data.depositAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          deposit: {data.depositAddress.slice(0, 10)}…{data.depositAddress.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}
