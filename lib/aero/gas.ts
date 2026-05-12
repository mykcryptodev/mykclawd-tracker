// Cache the gas cost (gasUsed × effectiveGasPrice) for each strategy tx hash.
// Finalized-block data so the cache never goes stale.

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { db } from "../../db/client";
import { aeroGasCache } from "../../db/schema";
import { inArray } from "drizzle-orm";

const rpc = createPublicClient({
  chain: base,
  transport: http(process.env.COINBASE_RPC_URL ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

export async function ingestAeroGas(txHashes: string[]): Promise<{ cached: number; fetched: number; totalGasWei: bigint }> {
  if (txHashes.length === 0) return { cached: 0, fetched: 0, totalGasWei: 0n };

  // Find which hashes we already have
  const existing = new Set(
    db.select({ tx: aeroGasCache.txHash })
      .from(aeroGasCache)
      .where(inArray(aeroGasCache.txHash, txHashes))
      .all()
      .map((r) => r.tx)
  );
  const missing = txHashes.filter((h) => !existing.has(h));

  let fetched = 0;
  for (const h of missing) {
    try {
      const r = await rpc.getTransactionReceipt({ hash: h as `0x${string}` });
      if (r.status !== "success") continue;
      const wei = r.gasUsed * r.effectiveGasPrice;
      db.insert(aeroGasCache)
        .values({ txHash: h, gasWei: wei.toString(), blockNumber: Number(r.blockNumber) })
        .onConflictDoNothing()
        .run();
      fetched++;
    } catch {
      // skip transient RPC failures — they'll be retried on next sync
    }
  }

  // Sum gas for the requested hashes
  const rows = db.select()
    .from(aeroGasCache)
    .where(inArray(aeroGasCache.txHash, txHashes))
    .all();
  const totalGasWei = rows.reduce((s, r) => s + BigInt(r.gasWei), 0n);

  return { cached: existing.size, fetched, totalGasWei };
}
