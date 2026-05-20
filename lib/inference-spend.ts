import { db } from "../db/client";
import { transfers } from "../db/schema";
import { eq, and } from "drizzle-orm";

// USDC transfers for inference go to this receiver contract, not the 0x0770d2124... entrypoint
const SURPLUS_INTELLIGENCE = "0xadcb90777d62b55f8b34030a581bdc653116ad26";
const USDC_DECIMALS = 6;

// On-chain allowance check: my wallet → SI settlement contract
const MY_WALLET = "0xcef6e6639e0c60d5c0805670f4363a6698081fab";
const SI_SETTLEMENT = "0x0770d2124C0a581C28Cfc47a659817145e6Cc137";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC =
  process.env.BASE_RPC_URL ??
  "https://api.developer.coinbase.com/rpc/v1/base/x4vFn85Dic5JAniLUx16KFMJ1IBUjISU";

async function fetchSiAllowanceUsd(): Promise<number> {
  try {
    // allowance(address owner, address spender)
    const owner = MY_WALLET.toLowerCase().replace("0x", "").padStart(64, "0");
    const spender = SI_SETTLEMENT.toLowerCase().replace("0x", "").padStart(64, "0");
    const data = "0xdd62ed3e" + owner + spender;

    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data }, "latest"],
        id: 1,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as { result?: string };
    if (!json.result) return 0;
    return Number(BigInt(json.result)) / 10 ** USDC_DECIMALS;
  } catch {
    return 0;
  }
}

export interface InferenceSpend {
  totalUsd: number;
  txCount: number;
  firstDate: string | null;
  siAllowanceUsd: number;
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

  if (rows.length === 0) return { totalUsd: 0, txCount: 0, firstDate: null, siAllowanceUsd: 0 };

  let totalUsd = 0;
  let firstTs = Infinity;

  for (const row of rows) {
    totalUsd += Number(BigInt(row.rawAmount)) / 10 ** USDC_DECIMALS;
    if (row.blockTimestamp < firstTs) firstTs = row.blockTimestamp;
  }

  const siAllowanceUsd = await fetchSiAllowanceUsd();

  return {
    totalUsd,
    txCount: new Set(rows.map((r) => r.txHash)).size,
    firstDate: firstTs === Infinity ? null : new Date(firstTs * 1000).toISOString().slice(0, 10),
    siAllowanceUsd,
  };
}
