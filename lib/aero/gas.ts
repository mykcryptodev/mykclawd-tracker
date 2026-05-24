// Cache the gas cost (gasUsed × effectiveGasPrice) for each strategy tx hash.
// Finalized-block data so the cache never goes stale.

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { db } from "../../db/client";
import { aeroGasCache } from "../../db/schema";
import { inArray } from "drizzle-orm";
import { cdpQuery, sqlString, CdpSqlError } from "../cdp-sql";

const rpc = createPublicClient({
  chain: base,
  transport: http(process.env.COINBASE_RPC_URL ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

async function fetchGasViaSql(
  hashes: string[],
): Promise<Map<string, { gasWei: bigint; blockNumber: number }> | null> {
  if (hashes.length === 0) return new Map();
  const inList = hashes.map((h) => sqlString(h.toLowerCase())).join(", ");
  try {
    const rows = (await cdpQuery(`
      SELECT transaction_hash, gas_used, effective_gas_price, block_number
      FROM base.transactions
      WHERE transaction_hash IN (${inList})
      AND block_date >= DATE '2024-01-01'
    `)) as Array<{
      transaction_hash: string;
      gas_used: string | number | bigint;
      effective_gas_price: string | number | bigint;
      block_number: string | number;
    }>;
    const result = new Map<string, { gasWei: bigint; blockNumber: number }>();
    for (const row of rows) {
      const gasWei = BigInt(row.gas_used) * BigInt(row.effective_gas_price);
      result.set(row.transaction_hash.toLowerCase(), {
        gasWei,
        blockNumber: Number(row.block_number),
      });
    }
    return result;
  } catch (e) {
    if (e instanceof CdpSqlError) return null;
    throw e;
  }
}

export async function ingestAeroGas(txHashes: string[]): Promise<{ cached: number; fetched: number; totalGasWei: bigint }> {
  if (txHashes.length === 0) return { cached: 0, fetched: 0, totalGasWei: 0n };

  // Find which hashes we already have
  const existing = new Set(
    (await db.select({ tx: aeroGasCache.txHash })
      .from(aeroGasCache)
      .where(inArray(aeroGasCache.txHash, txHashes))
      .all())
      .map((r) => r.tx)
  );
  const missing = txHashes.filter((h) => !existing.has(h));

  let fetched = 0;
  const sqlGasMap = await fetchGasViaSql(missing);

  if (sqlGasMap !== null) {
    for (const [hash, { gasWei, blockNumber }] of sqlGasMap) {
      await db.insert(aeroGasCache)
        .values({ txHash: hash, gasWei: gasWei.toString(), blockNumber })
        .onConflictDoNothing()
        .run();
      fetched++;
    }
  } else {
    // RPC fallback
    for (const h of missing) {
      try {
        const r = await rpc.getTransactionReceipt({ hash: h as `0x${string}` });
        if (r.status !== "success") continue;
        const wei = r.gasUsed * r.effectiveGasPrice;
        await db.insert(aeroGasCache)
          .values({ txHash: h, gasWei: wei.toString(), blockNumber: Number(r.blockNumber) })
          .onConflictDoNothing()
          .run();
        fetched++;
      } catch {
        // skip transient RPC failures
      }
    }
  }

  // Sum gas for the requested hashes
  const rows = await db.select()
    .from(aeroGasCache)
    .where(inArray(aeroGasCache.txHash, txHashes))
    .all();
  const totalGasWei = rows.reduce((s, r) => s + BigInt(r.gasWei), 0n);

  return { cached: existing.size, fetched, totalGasWei };
}
