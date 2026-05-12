import { runMigrations } from "../db/migrate";
import { enrichTokens } from "./ingest/tokens";
import { ingestTransfers } from "./ingest/transfers";
import { resolveTransactions } from "./ingest/transactions";
import { ingestPrices } from "./ingest/prices";
import { ingestLiquidity } from "./ingest/liquidity";
import { ingestImages } from "./ingest/images";
import { computePnl, recomputeTodaySnapshot } from "./pnl/snapshot";
import { ingestAeroMonitor } from "./aero";
import { db } from "../db/client";
import { lots, tokens } from "../db/schema";
import { publicClient, NATIVE_TOKEN_ADDRESS } from "./rpc";
import { erc20Abi } from "viem";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

export interface SyncResult {
  tokensAdded: number;
  newTransfers: number;
  blocksScanned: number;
  txResolved: number;
  pricesAdded: number;
  durationMs: number;
}

export interface SyncProgress {
  step: number;
  totalSteps: number;
  label: string;
  innerPct?: number; // 0-100 progress within the current step
  detail?: string;
}

const TOTAL_STEPS = 9;

export async function runSync(
  onProgress?: (event: SyncProgress) => void
): Promise<SyncResult> {
  const start = Date.now();
  const emit = (step: number, label: string, detail?: string) =>
    onProgress?.({ step, totalSteps: TOTAL_STEPS, label, detail });

  await runMigrations();

  emit(1, "Ingesting transfers");
  const { newTransfers, blocksScanned } = await ingestTransfers(TRACKED_ADDRESS);
  emit(1, "Ingesting transfers", `+${newTransfers} transfers · ${blocksScanned.toLocaleString()} blocks`);

  emit(2, "Enriching token metadata");
  const tokensAdded = await enrichTokens();
  emit(2, "Enriching token metadata", `+${tokensAdded} tokens`);

  emit(3, "Resolving transactions");
  const txResolved = await resolveTransactions(TRACKED_ADDRESS);
  emit(3, "Resolving transactions", `${txResolved} resolved`);

  emit(4, "Ingesting prices");
  const pricesAdded = await ingestPrices();
  emit(4, "Ingesting prices", `+${pricesAdded} price rows`);

  emit(5, "Fetching liquidity data");
  await ingestLiquidity((current, total) => {
    onProgress?.({
      step: 5,
      totalSteps: TOTAL_STEPS,
      label: "Fetching liquidity data",
      innerPct: Math.round((current / total) * 100),
      detail: `${current} / ${total} tokens`,
    });
  });
  emit(5, "Fetching liquidity data", "done");

  emit(6, "Resolving token images");
  await ingestImages((current, total) => {
    onProgress?.({
      step: 6,
      totalSteps: TOTAL_STEPS,
      label: "Resolving token images",
      innerPct: Math.round((current / total) * 100),
      detail: `${current} / ${total} tokens`,
    });
  });
  emit(6, "Resolving token images", "done");

  emit(7, "Computing PnL");
  await computePnl();
  emit(7, "Computing PnL", "done");

  // Reconcile lot quantities against live on-chain balances.
  // Transfer-event replay can miss outbound movements (internal calls, protocol-level
  // burns, or SQL ingestion gaps), leaving phantom balances.
  emit(8, "Reconciling balances");
  const allLots = await db.select().from(lots).all();
  const decimalsMap = new Map(
    (await db.select().from(tokens).all()).map((t) => [t.contractAddress, t.decimals])
  );

  let corrected = 0;
  for (const lot of allLots) {
    const computedQty = parseFloat(lot.quantity);
    if (computedQty <= 0) continue;

    try {
      let onChainQty: number;
      if (lot.tokenAddress === NATIVE_TOKEN_ADDRESS) {
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

      const discrepancyPct = Math.abs(onChainQty - computedQty) / computedQty;
      if (onChainQty < computedQty && discrepancyPct > 0.01) {
        await db.insert(lots)
          .values({
            tokenAddress: lot.tokenAddress,
            quantity: onChainQty.toString(),
            avgCostUsd: lot.avgCostUsd,
            realizedPnlUsd: lot.realizedPnlUsd,
          })
          .onConflictDoUpdate({
            target: lots.tokenAddress,
            set: { quantity: onChainQty.toString() },
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
    tokensAdded,
    newTransfers,
    blocksScanned,
    txResolved,
    pricesAdded,
    durationMs,
  };
}
