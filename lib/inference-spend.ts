import { db } from "../db/client";
import { transfers } from "../db/schema";
import { eq, and } from "drizzle-orm";

// USDC transfers for inference go to this receiver contract, not the 0x0770d2124... entrypoint
const SURPLUS_INTELLIGENCE = "0xadcb90777d62b55f8b34030a581bdc653116ad26";
const USDC_DECIMALS = 6;

export interface InferenceSpend {
  totalUsd: number;
  txCount: number;
  firstDate: string | null;
}

export async function fetchInferenceSpend(): Promise<InferenceSpend> {
  const rows = await db
    .select({
      txHash: transfers.txHash,
      blockTimestamp: transfers.blockTimestamp,
      rawAmount: transfers.rawAmount,
    })
    .from(transfers)
    .where(
      and(
        eq(transfers.counterparty, SURPLUS_INTELLIGENCE),
        eq(transfers.direction, "out")
      )
    )
    .all();

  if (rows.length === 0) return { totalUsd: 0, txCount: 0, firstDate: null };

  let totalUsd = 0;
  let firstTs = Infinity;

  for (const row of rows) {
    totalUsd += Number(BigInt(row.rawAmount)) / 10 ** USDC_DECIMALS;
    if (row.blockTimestamp < firstTs) firstTs = row.blockTimestamp;
  }

  return {
    totalUsd,
    txCount: new Set(rows.map((r) => r.txHash)).size,
    firstDate: firstTs === Infinity ? null : new Date(firstTs * 1000).toISOString().slice(0, 10),
  };
}
