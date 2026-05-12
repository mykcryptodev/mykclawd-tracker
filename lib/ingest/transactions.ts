import { db } from "../../db/client";
import { transactions, transfers } from "../../db/schema";
import { getTransaction, NATIVE_TOKEN_ADDRESS } from "../rpc";
import { CdpSqlError, cdpQuery, parseSqlTimestamp, sqlString } from "../cdp-sql";

const CONCURRENCY = 20;
const SQL_BATCH_SIZE = 250;

type TxHashRow = { txHash: string };
type CdpTransactionRow = {
  transaction_hash?: unknown;
  block_number?: unknown;
  timestamp?: unknown;
  from_address?: unknown;
  to_address?: unknown;
  value?: unknown;
  gas?: unknown;
  gas_price?: unknown;
};

export async function resolveTransactions(address: string): Promise<number> {
  const normalizedAddress = address.toLowerCase();

  // Two queries instead of N+1: load all transfer hashes, load resolved hashes, diff in JS
  const allHashes = await db
    .select({ txHash: transfers.txHash })
    .from(transfers)
    .all();
  const resolvedSet = new Set(
    (await db.select({ txHash: transactions.txHash }).from(transactions).all()).map((r) => r.txHash)
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

  async function processSqlTx(row: CdpTransactionRow) {
    const txHash = row.transaction_hash?.toString();
    if (!txHash) return false;

    const from = (row.from_address?.toString() ?? "").toLowerCase();
    const to = (row.to_address?.toString() ?? "").toLowerCase();
    const blockNum = Number(row.block_number ?? 0);
    const gas = BigInt(row.gas?.toString() ?? "0");
    const gasPrice = BigInt(row.gas_price?.toString() ?? "0");
    const value = BigInt(row.value?.toString() ?? "0");
    const isOriginator = from === normalizedAddress;

    await db.insert(transactions)
      .values({
        txHash,
        blockNumber: blockNum,
        blockTimestamp: parseSqlTimestamp(row.timestamp as string | number),
        gasUsed: gas.toString(),
        effectiveGasPrice: gasPrice.toString(),
        gasEthWei: isOriginator ? (gas * gasPrice).toString() : "0",
      })
      .onConflictDoNothing()
      .run();

    if (value > 0n && (from === normalizedAddress || to === normalizedAddress)) {
      const direction = from === normalizedAddress ? "out" : "in";
      await db.insert(transfers)
        .values({
          txHash,
          logIndex: -1,
          blockNumber: blockNum,
          blockTimestamp: parseSqlTimestamp(row.timestamp as string | number),
          tokenAddress: NATIVE_TOKEN_ADDRESS,
          direction,
          rawAmount: value.toString(),
          counterparty: direction === "in" ? from : to,
        })
        .onConflictDoNothing()
        .run();
    }

    return true;
  }

  async function processRpcTx(txHash: string) {
    try {
      const tx = await getTransaction(txHash as `0x${string}`);
      if (!tx) return false;

      const gasWei = BigInt(tx.gas ?? 0n) * BigInt(tx.gasPrice ?? tx.maxFeePerGas ?? 0n);
      const isOriginator = tx.from.toLowerCase() === normalizedAddress;
      const BASE_GENESIS_UNIX = 1686789347;
      const blockNum = Number(tx.blockNumber ?? 0n);

      await db.insert(transactions)
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
          await db.insert(transfers)
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

      return true;
    } catch {
      // Skip if RPC fails for this tx
      return false;
    }
  }

  async function processSqlBatch(batch: TxHashRow[]) {
    const quoted = batch.map((r) => sqlString(r.txHash)).join(", ");
    try {
      const rows = (await cdpQuery(`
        SELECT transaction_hash, block_number, timestamp, from_address, to_address, value, gas, gas_price
        FROM base.transactions
        WHERE transaction_hash IN (${quoted})
      `)) as CdpTransactionRow[];

      const seen = new Set<string>();
      for (const row of rows) {
        const hash = row.transaction_hash?.toString();
        if (hash) seen.add(hash);
        if (await processSqlTx(row)) resolved++;
      }

      const missing = batch.filter((r) => !seen.has(r.txHash));
      for (let i = 0; i < missing.length; i += CONCURRENCY) {
        const fallbackBatch = missing.slice(i, i + CONCURRENCY);
        const results = await Promise.all(fallbackBatch.map((r) => processRpcTx(r.txHash)));
        resolved += results.filter(Boolean).length;
      }
    } catch (e) {
      if (!(e instanceof CdpSqlError)) throw e;
      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const fallbackBatch = batch.slice(i, i + CONCURRENCY);
        const results = await Promise.all(fallbackBatch.map((r) => processRpcTx(r.txHash)));
        resolved += results.filter(Boolean).length;
      }
    }
  }

  // Resolve in SQL batches; only missing/erroring rows fall back to RPC.
  for (let i = 0; i < total; i += SQL_BATCH_SIZE) {
    const batch = uniqueHashes.slice(i, i + SQL_BATCH_SIZE);
    await processSqlBatch(batch);
    console.log(`  ${Math.min(i + SQL_BATCH_SIZE, total)}/${total} txs | ${resolved} resolved`);
  }

  return resolved;
}
