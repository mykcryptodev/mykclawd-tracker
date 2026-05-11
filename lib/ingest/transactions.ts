import { db } from "../../db/client";
import { transactions, transfers } from "../../db/schema";
import { getTransaction, NATIVE_TOKEN_ADDRESS } from "../rpc";
import { eq } from "drizzle-orm";

const CONCURRENCY = 20;

export async function resolveTransactions(address: string): Promise<number> {
  const normalizedAddress = address.toLowerCase();

  // Two queries instead of N+1: load all transfer hashes, load resolved hashes, diff in JS
  const allHashes = db
    .select({ txHash: transfers.txHash })
    .from(transfers)
    .all();
  const resolvedSet = new Set(
    db.select({ txHash: transactions.txHash }).from(transactions).all().map((r) => r.txHash)
  );
  const uniqueHashes = [
    ...new Map(
      allHashes
        .filter((r) => !resolvedSet.has(r.txHash))
        .map((r) => [r.txHash, r])
    ).values(),
  ];

  let resolved = 0;
  const total = uniqueHashes.length;

  async function processTx(txHash: string) {
    try {
      const tx = await getTransaction(txHash as `0x${string}`);
      if (!tx) return;

      const gasWei = BigInt(tx.gas ?? 0n) * BigInt(tx.gasPrice ?? tx.maxFeePerGas ?? 0n);
      const isOriginator = tx.from.toLowerCase() === normalizedAddress;
      const BASE_GENESIS_UNIX = 1686789347;
      const blockNum = Number(tx.blockNumber ?? 0n);

      db.insert(transactions)
        .values({
          txHash,
          blockNumber: blockNum,
          blockTimestamp: BASE_GENESIS_UNIX + blockNum * 2,
          gasUsed: tx.gas.toString(),
          effectiveGasPrice: (tx.gasPrice ?? tx.maxFeePerGas ?? 0n).toString(),
          gasEthWei: isOriginator ? gasWei.toString() : "0",
        })
        .onConflictDoNothing()
        .run();

      if (tx.value > 0n) {
        const from = tx.from.toLowerCase();
        const to = (tx.to ?? "").toLowerCase();
        if (from === normalizedAddress || to === normalizedAddress) {
          const direction = from === normalizedAddress ? "out" : "in";
          db.insert(transfers)
            .values({
              txHash,
              logIndex: -1,
              blockNumber: blockNum,
              blockTimestamp: BASE_GENESIS_UNIX + blockNum * 2,
              tokenAddress: NATIVE_TOKEN_ADDRESS,
              direction,
              rawAmount: tx.value.toString(),
              counterparty: direction === "in" ? from : to,
            })
            .onConflictDoNothing()
            .run();
        }
      }

      resolved++;
    } catch {
      // Skip if RPC fails for this tx
    }
  }

  // Process in parallel batches of CONCURRENCY
  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = uniqueHashes.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((r) => processTx(r.txHash)));
    console.log(`  ${Math.min(i + CONCURRENCY, total)}/${total} txs | ${resolved} resolved`);
  }

  return resolved;
}
