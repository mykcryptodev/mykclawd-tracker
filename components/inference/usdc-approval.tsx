"use client";

import { useEffect, useRef, useState } from "react";
import { getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { useReadContract } from "thirdweb/react";
import { thirdwebClient } from "@/lib/thirdweb-client";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SURPLUS_ADDRESS = "0x0770d2124C0a581C28Cfc47a659817145e6Cc137";
const OWNER_ADDRESS = "0xcef6e6639e0c60d5c0805670f4363a6698081fab";
const USDC_DECIMALS = 6;
const TILE_H = 56;

const usdcContract = getContract({
  client: thirdwebClient,
  chain: base,
  address: USDC_ADDRESS,
});

function formatUsdc(raw: bigint): string {
  // Treat anything >= 2^128 as "unlimited" (covers type(uint256).max)
  if (raw >= BigInt("0x100000000000000000000000000000000")) return "Unlimited";
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = raw / divisor;
  const cents = raw % divisor;
  const centsStr = cents.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${centsStr}`;
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

  const isSep = char === "." || char === ",";

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

export function UsdcApproval() {
  const { data, isLoading, isError } = useReadContract({
    contract: usdcContract,
    method:
      "function allowance(address owner, address spender) view returns (uint256)",
    params: [OWNER_ADDRESS, SURPLUS_ADDRESS],
    queryOptions: {
      refetchInterval: 15_000,
    },
  });

  const formatted = data !== undefined ? formatUsdc(data) : null;
  const isUnlimited = formatted === "Unlimited";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          USDC Approval to Surplus Intelligence
        </p>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Live · Base</span>
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
        <p className="text-sm text-muted-foreground">Failed to load approval</p>
      )}

      {!isLoading && !isError && formatted && (
        <div className="flex items-end gap-2 flex-wrap">
          {isUnlimited ? (
            <span
              className="font-mono font-bold text-amber-300"
              style={{ fontSize: `${Math.round(TILE_H * 0.52)}px`, lineHeight: 1 }}
            >
              Unlimited
            </span>
          ) : (
            <div className="flex items-center gap-0.5">
              {formatted.split("").map((c, i) => (
                <SplitFlapChar key={i} char={c} />
              ))}
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground pb-1">USDC</span>
        </div>
      )}

      {/* Basescan link */}
      <a
        href={`https://basescan.org/token/${USDC_ADDRESS}?a=${SURPLUS_ADDRESS}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        spender: {SURPLUS_ADDRESS.slice(0, 10)}…{SURPLUS_ADDRESS.slice(-6)} ↗
      </a>
    </div>
  );
}
