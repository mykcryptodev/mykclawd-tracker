// Pull the tracked wallet's NAV + token holdings from Zerion and cache them in
// our DB. Orders from CoW Swap, Bankr, and Definitive are also fetched and stored.
// This runs on a schedule (6h cron) + rate-limited on demand — never on render.

import { runMigrations } from "../../db/migrate";
import { db } from "../../db/client";
import {
  portfolioNav,
  portfolioPositions,
  portfolioSync,
  portfolioOrders,
} from "../../db/schema";
import { gt, notInArray } from "drizzle-orm";
import {
  fetchZerionPositions,
  fetchZerionPnlBatch,
  fetchZerionWalletNav,
} from "./zerion";
import { fetchCowswapOrders } from "../orders/cowswap";
import { fetchBankrOrders } from "../orders/bankr";
import { fetchDefinitiveOrders } from "../orders/definitive";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS?.trim() ||
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PortfolioSyncResult {
  totalUsd: number;
  tokenCount: number;
  nativeEthUsd: number;
  historyTicks: number;
  syncedAt: number;
  durationMs: number;
  ordersCount: number;
}

export async function syncPortfolioNav(
  address: string = TRACKED_ADDRESS
): Promise<PortfolioSyncResult> {
  const start = Date.now();
  await runMigrations();

  // ── 1. Current holdings from Zerion ───────────────────────────────────────
  const { tokens, nativeEth, totalUsd } = await fetchZerionPositions(address);
  const syncedAt = Math.floor(Date.now() / 1000);
  const today = todayUtc();

  // ── 2. Per-token PnL from Zerion ──────────────────────────────────────────
  // Fetch PnL for all ERC-20 tokens in parallel (batched to avoid rate limits).
  // Native ETH uses a different endpoint so handle separately.
  const erc20Addresses = tokens.map((t) => t.tokenAddress).filter((a) => a !== "native");
  const pnlMap = await fetchZerionPnlBatch(address, erc20Addresses, 4);

  // Native ETH PnL (optional — may not have cost basis)
  let nativeEthPnl = null;
  if (nativeEth) {
    try {
      // Zerion ETH on Base: fungible_id is "base-asset" — use a different query
      const url =
        `/wallets/${address}/pnl?currency=usd&filter[chain_ids]=base&filter[fungible_ids]=base-asset`;
      // Add trailing slash to avoid 301 redirect stripping the auth header
      const [p, q] = url.split("?");
      const slashedUrl = `https://api.zerion.io/v1${p.endsWith("/") ? p : p + "/"}${q ? "?" + q : ""}`;
      const res = await fetch(slashedUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${process.env.ZERION_API_KEY ?? ""}:`).toString("base64"),
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const attr = data?.data?.attributes;
        if (attr) {
          nativeEthPnl = {
            realizedGain: attr.realized_gain,
            unrealizedGain: attr.unrealized_gain,
            totalGain: attr.total_gain,
            totalGainPct: attr.relative_total_gain_percentage,
            realizedGainPct: attr.relative_realized_gain_percentage,
            unrealizedGainPct: attr.relative_unrealized_gain_percentage,
            totalInvested: attr.total_invested,
          };
        }
      }
    } catch {
      // non-fatal
    }
  }

  // ── 3. Persist positions ───────────────────────────────────────────────────
  const allTokens = nativeEth ? [...tokens, nativeEth] : tokens;

  for (const t of allTokens) {
    const pnl = pnlMap.get(t.tokenAddress) ?? (t.isNative ? nativeEthPnl : null);

    await db
      .insert(portfolioPositions)
      .values({
        tokenAddress: t.tokenAddress,
        symbol: t.symbol,
        name: t.name,
        network: "Base",
        imgUrl: t.imgUrl,
        price: t.price,
        balance: t.balance,
        balanceRaw: t.balanceRaw,
        balanceUsd: t.balanceUsd,
        realizedGain: pnl?.realizedGain ?? null,
        unrealizedGain: pnl?.unrealizedGain ?? null,
        totalGain: pnl?.totalGain ?? null,
        totalGainPct: pnl?.totalGainPct ?? null,
        realizedGainPct: pnl?.realizedGainPct ?? null,
        unrealizedGainPct: pnl?.unrealizedGainPct ?? null,
        totalInvested: pnl?.totalInvested ?? null,
        change1dUsd: t.change1dUsd ?? null,
        change1dPct: t.change1dPct ?? null,
        updatedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: portfolioPositions.tokenAddress,
        set: {
          symbol: t.symbol,
          name: t.name,
          network: "Base",
          imgUrl: t.imgUrl,
          price: t.price,
          balance: t.balance,
          balanceRaw: t.balanceRaw,
          balanceUsd: t.balanceUsd,
          realizedGain: pnl?.realizedGain ?? null,
          unrealizedGain: pnl?.unrealizedGain ?? null,
          totalGain: pnl?.totalGain ?? null,
          totalGainPct: pnl?.totalGainPct ?? null,
          realizedGainPct: pnl?.realizedGainPct ?? null,
          unrealizedGainPct: pnl?.unrealizedGainPct ?? null,
          totalInvested: pnl?.totalInvested ?? null,
          change1dUsd: t.change1dUsd ?? null,
          change1dPct: t.change1dPct ?? null,
          updatedAt: syncedAt,
        },
      })
      .run();
  }

  const keep = allTokens.map((t) => t.tokenAddress);
  if (keep.length > 0) {
    await db
      .delete(portfolioPositions)
      .where(notInArray(portfolioPositions.tokenAddress, keep))
      .run();
  } else {
    await db.delete(portfolioPositions).run();
  }

  // ── 4. Sync metadata ──────────────────────────────────────────────────────
  const nativeEthBalance = nativeEth?.balance ?? 0;
  const nativeEthUsd = nativeEth?.balanceUsd ?? 0;

  await db
    .insert(portfolioSync)
    .values({
      id: 1,
      syncedAt,
      totalUsd,
      tokenCount: allTokens.length,
      nativeEthBalance,
      nativeEthUsd,
      error: null,
    })
    .onConflictDoUpdate({
      target: portfolioSync.id,
      set: {
        syncedAt,
        totalUsd,
        tokenCount: allTokens.length,
        nativeEthBalance,
        nativeEthUsd,
        error: null,
      },
    })
    .run();

  // ── 5. Today's live NAV ───────────────────────────────────────────────────
  await db
    .insert(portfolioNav)
    .values({ date: today, valueUsd: totalUsd, source: "live" })
    .onConflictDoUpdate({
      target: portfolioNav.date,
      set: { valueUsd: totalUsd, source: "live" },
    })
    .run();

  // ── 6. Historical NAV backfill from Zerion, on the same basis as live NAV ──
  let historyTicks = 0;
  try {
    const ticks = await fetchZerionWalletNav(address);
    for (const tick of ticks) {
      if (tick.date >= today) continue;
      await db
        .insert(portfolioNav)
        .values({ date: tick.date, valueUsd: tick.valueUsd, source: "zerion_history" })
        .onConflictDoUpdate({
          target: portfolioNav.date,
          set: { valueUsd: tick.valueUsd, source: "zerion_history" },
        })
        .run();
      historyTicks++;
    }
  } catch (e) {
    console.warn(`  Zerion wallet chart backfill skipped: ${(e as Error).message}`);
  }

  await db.delete(portfolioNav).where(gt(portfolioNav.date, today)).run();

  // ── 7. Orders from all sources ────────────────────────────────────────────
  let ordersCount = 0;
  try {
    const [cowOrders, bankrOrders, definitiveOrders] = await Promise.allSettled([
      fetchCowswapOrders(address),
      fetchBankrOrders(),
      fetchDefinitiveOrders(address),
    ]);

    const allOrders = [
      ...(cowOrders.status === "fulfilled" ? cowOrders.value : []),
      ...(bankrOrders.status === "fulfilled" ? bankrOrders.value : []),
      ...(definitiveOrders.status === "fulfilled" ? definitiveOrders.value : []),
    ];

    for (const order of allOrders) {
      if (order.source === "cowswap") {
        await db
          .insert(portfolioOrders)
          .values({
            orderId: order.orderId,
            source: "cowswap",
            status: order.status,
            type: order.type,
            side: order.side,
            sellToken: order.sellToken,
            buyToken: order.buyToken,
            sellAmount: order.sellAmount,
            buyAmount: order.buyAmount,
            executedSellAmount: order.executedSellAmount,
            executedBuyAmount: order.executedBuyAmount,
            fee: order.fee,
            expiresAt: order.expiresAt,
            createdAt: order.createdAt,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: [portfolioOrders.source, portfolioOrders.orderId],
            set: {
              status: order.status,
              executedSellAmount: order.executedSellAmount,
              executedBuyAmount: order.executedBuyAmount,
              fee: order.fee,
              syncedAt,
            },
          })
          .run();
      } else if (order.source === "bankr") {
        await db
          .insert(portfolioOrders)
          .values({
            orderId: order.orderId,
            source: "bankr",
            status: order.status,
            type: order.type,
            side: order.side ?? undefined,
            tokenAddress: order.tokenAddress ?? undefined,
            tokenSymbol: order.tokenSymbol ?? undefined,
            description: order.description,
            priceUsd: order.targetPrice ?? undefined,
            quantity: order.amount !== null ? String(order.amount) : undefined,
            createdAt: order.createdAt ?? undefined,
            updatedAt: order.triggeredAt ?? undefined,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: [portfolioOrders.source, portfolioOrders.orderId],
            set: {
              status: order.status,
              updatedAt: order.triggeredAt ?? undefined,
              syncedAt,
            },
          })
          .run();
      } else if (order.source === "definitive") {
        await db
          .insert(portfolioOrders)
          .values({
            orderId: order.orderId,
            source: "definitive",
            status: order.status,
            type: order.type,
            side: order.side,
            sellToken: order.side === "sell" ? order.targetAsset : order.contraAsset,
            buyToken: order.side === "buy" ? order.targetAsset : order.contraAsset,
            tokenAddress: order.targetAsset || undefined,
            tokenSymbol: order.targetSymbol ?? undefined,
            quantity: order.quantity,
            filledQuantity: order.filledQuantity ?? undefined,
            priceUsd: order.priceUsd ?? undefined,
            createdAt: order.createdAt ?? undefined,
            updatedAt: order.updatedAt ?? undefined,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: [portfolioOrders.source, portfolioOrders.orderId],
            set: {
              status: order.status,
              filledQuantity: order.filledQuantity ?? undefined,
              updatedAt: order.updatedAt ?? undefined,
              syncedAt,
            },
          })
          .run();
      }
    }

    ordersCount = allOrders.length;

    if (cowOrders.status === "rejected")
      console.warn("CoW orders fetch failed:", cowOrders.reason);
    if (bankrOrders.status === "rejected")
      console.warn("Bankr orders fetch failed:", bankrOrders.reason);
    if (definitiveOrders.status === "rejected")
      console.warn("Definitive orders fetch failed:", definitiveOrders.reason);
  } catch (e) {
    console.warn("Orders sync failed:", (e as Error).message);
  }

  return {
    totalUsd,
    tokenCount: allTokens.length,
    nativeEthUsd,
    historyTicks,
    syncedAt,
    durationMs: Date.now() - start,
    ordersCount,
  };
}
