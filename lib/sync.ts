import { runMigrations } from "../db/migrate";
import { enrichTokens } from "./ingest/tokens";
import {
  ingestNativeEthBackfill,
  ingestTransfers,
  synthesizeEthFromWethWithdrawals,
} from "./ingest/transfers";
import { resolveTransactions } from "./ingest/transactions";
import { getPriceForDate, ingestPrices } from "./ingest/prices";
import { ingestLiquidity } from "./ingest/liquidity";
import { ingestImages } from "./ingest/images";
import {
  computePnl,
  computePnlIncremental,
  initializePnlCursorFromCurrentState,
  recomputeTodaySnapshot,
} from "./pnl/snapshot";
import { ingestAeroMonitor } from "./aero";
import { db } from "../db/client";
import { lots, tokens } from "../db/schema";
import { publicClient, NATIVE_TOKEN_ADDRESS } from "./rpc";
import { erc20Abi } from "viem";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS?.trim() ||
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

export interface SyncResult {
  mode: SyncMode;
  tokensAdded: number;
  newTransfers: number;
  nativeEthTransfers: number;
  blocksScanned: number;
  txResolved: number;
  pricesAdded: number;
  pnlEventsProcessed: number | null;
  durationMs: number;
}

export interface SyncProgress {
  step: number;
  totalSteps: number;
  label: string;
  innerPct?: number; // 0-100 progress within the current step
  detail?: string;
}

export type SyncMode = "fast" | "full";

export interface SyncOptions {
  mode?: SyncMode;
}

const TOTAL_STEPS = 9;

export async function runSync(
  options: SyncOptions = {},
  onProgress?: (event: SyncProgress) => void
): Promise<SyncResult> {
  const mode = options.mode ?? "fast";
  const start = Date.now();
  const emit = (step: number, label: string, detail?: string) =>
    onProgress?.({ step, totalSteps: TOTAL_STEPS, label, detail });

  await runMigrations();
  if (mode === "fast") {
    await initializePnlCursorFromCurrentState();
  }

  emit(1, "Ingesting transfers");
  const { newTransfers, blocksScanned } = await ingestTransfers(TRACKED_ADDRESS);
  const nativeEthTransfers =
    (await ingestNativeEthBackfill(TRACKED_ADDRESS)) +
    (await synthesizeEthFromWethWithdrawals());
  emit(
    1,
    "Ingesting transfers",
    `+${newTransfers} token transfers · +${nativeEthTransfers} ETH transfers · ${blocksScanned.toLocaleString()} blocks`
  );

  emit(2, "Enriching token metadata");
  const tokensAdded = await enrichTokens();
  emit(2, "Enriching token metadata", `+${tokensAdded} tokens`);

  emit(3, "Resolving transactions");
  emit(4, "Ingesting prices");
  emit(5, "Fetching liquidity data");
  emit(6, "Resolving token images");

  const [txResolved, pricesAdded] = await Promise.all([
    resolveTransactions(TRACKED_ADDRESS).then((n) => {
      emit(3, "Resolving transactions", `${n} resolved`);
      return n;
    }),
    ingestPrices().then((n) => {
      emit(4, "Ingesting prices", `+${n} price rows`);
      return n;
    }),
    ingestLiquidity((current, total) => {
      onProgress?.({
        step: 5,
        totalSteps: TOTAL_STEPS,
        label: "Fetching liquidity data",
        innerPct: Math.round((current / total) * 100),
        detail: `${current} / ${total} tokens`,
      });
    }).then(() => emit(5, "Fetching liquidity data", "done")),
    ingestImages((current, total) => {
      onProgress?.({
        step: 6,
        totalSteps: TOTAL_STEPS,
        label: "Resolving token images",
        innerPct: Math.round((current / total) * 100),
        detail: `${current} / ${total} tokens`,
      });
    }).then(() => emit(6, "Resolving token images", "done")),
  ]);

  emit(7, mode === "full" ? "Computing full PnL" : "Computing incremental PnL");
  let pnlEventsProcessed: number | null = null;
  if (mode === "full") {
    await computePnl();
    emit(7, "Computing full PnL", "full replay done");
  } else {
    const pnl = await computePnlIncremental();
    pnlEventsProcessed = pnl.eventsProcessed;
    const detail = pnl.fullReplay
      ? "bootstrap full replay done"
      : pnl.initializedCursor
        ? "cursor initialized"
        : `${pnl.eventsProcessed} events · ${pnl.snapshotsWritten} snapshots`;
    emit(7, "Computing incremental PnL", detail);
  }

  // Reconcile lot quantities against live on-chain balances.
  // Transfer-event replay can miss internal movements or SQL ingestion gaps. ERC-20
  // reconciliation only lowers phantom balances; native ETH can move both ways.
  emit(8, "Reconciling balances");
  const today = new Date().toISOString().slice(0, 10);
  const allLots = await db.select().from(lots).all();
  if (!allLots.some((lot) => lot.tokenAddress === NATIVE_TOKEN_ADDRESS)) {
    allLots.push({
      tokenAddress: NATIVE_TOKEN_ADDRESS,
      quantity: "0",
      avgCostUsd: 0,
      realizedPnlUsd: 0,
    });
  }
  const decimalsMap = new Map(
    (await db.select().from(tokens).all()).map((t) => [t.contractAddress, t.decimals])
  );

  let corrected = 0;
  for (const lot of allLots) {
    const computedQty = parseFloat(lot.quantity);
    const isNativeEth = lot.tokenAddress === NATIVE_TOKEN_ADDRESS;
    if (computedQty <= 0 && !isNativeEth) continue;

    try {
      let onChainQty: number;
      if (isNativeEth) {
        const wei = await publicClient.getBalance({ address: TRACKED_ADDRESS as `0x${string}` });
        onChainQty = Number(wei) / 1e18;
      } else {
        const raw = await publicClient.readContract({
          address: lot.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [TRACKED_ADDRESS as `0x${string}`],
        });
        const decimals = decimalsMap.get(lot.tokenAddress) ?? 18;
        onChainQty = Number(raw) / 10 ** decimals;
      }

      const discrepancyPct = Math.abs(onChainQty - computedQty) / Math.max(computedQty, 1e-12);
      const shouldCorrect = isNativeEth
        ? Math.abs(onChainQty - computedQty) > 1e-10 && discrepancyPct > 0.01
        : onChainQty < computedQty && discrepancyPct > 0.01;

      if (shouldCorrect) {
        const avgCostUsd =
          isNativeEth && computedQty <= 0 && onChainQty > 0 && lot.avgCostUsd === 0
            ? await getPriceForDate(NATIVE_TOKEN_ADDRESS, today)
            : lot.avgCostUsd;

        await db.insert(lots)
          .values({
            tokenAddress: lot.tokenAddress,
            quantity: onChainQty.toString(),
            avgCostUsd,
            realizedPnlUsd: lot.realizedPnlUsd,
          })
          .onConflictDoUpdate({
            target: lots.tokenAddress,
            set: { quantity: onChainQty.toString(), avgCostUsd },
          })
          .run();
        corrected++;
      }
    } catch {
      // RPC failure — leave the lot as-is
    }
  }
  await recomputeTodaySnapshot();
  emit(8, "Reconciling balances", `${corrected} corrected`);

  emit(9, "Aerodrome LP monitor");
  try {
    const aero = await ingestAeroMonitor(14);
    if (aero.position && aero.snapshot) {
      emit(9, "Aerodrome LP monitor", `+${aero.newTransfers} transfers · Δ vs HODL $${aero.snapshot.usd.deltaUsd.toFixed(2)}`);
    } else {
      emit(9, "Aerodrome LP monitor", "no active position");
    }
  } catch (e) {
    emit(9, "Aerodrome LP monitor", `skipped: ${(e as Error).message.slice(0, 80)}`);
  }

  const durationMs = Date.now() - start;

  return {
    mode,
    tokensAdded,
    newTransfers,
    nativeEthTransfers,
    blocksScanned,
    txResolved,
    pricesAdded,
    pnlEventsProcessed,
    durationMs,
  };
}
