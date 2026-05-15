/**
 * Hat Tap — Dept. of Agriculture yield tracker
 *
 * myk's hat is a yield-bearing wearable from deptofagri.com.
 * The smart wallet at HAT_WALLET sends weekly USDC rewards to myk's address.
 *
 * Smart (ERC-4337) wallet: 0xa8aa312eb3bd86b8d664608fcbcea12a6b0f9b91
 * Recipient (myk):         0x653ff253b0c7C1cc52f484e891b71f9f1F010Bfb
 * USDC on Base:            0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

import { cdpQuery, sqlString } from "./cdp-sql";

export const HAT_WALLET = "0xa8aa312eb3bd86b8d664608fcbcea12a6b0f9b91";
export const MYK_ADDRESS = "0x653ff253b0c7c1cc52f484e891b71f9f1f010bfb";
export const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export interface HatTap {
  date: string;       // YYYY-MM-DD
  amount: number;     // USDC
  txHash: string;
  to: string;
}

export interface HatTapSummary {
  taps: HatTap[];
  totalUsd: number;
  lastTapDate: string | null;
  nextExpected: string | null;   // estimated next Friday
  tapCount: number;
  avgTapUsd: number;
  firstTapDate: string | null;
}

function nextFriday(fromDate: Date): string {
  const d = new Date(fromDate);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const daysUntilFriday = (5 - day + 7) % 7 || 7; // always forward
  d.setUTCDate(d.getUTCDate() + daysUntilFriday);
  return d.toISOString().slice(0, 10);
}

export async function fetchHatTaps(): Promise<HatTapSummary> {
  // Query token_transfers on Base for USDC sent FROM hat wallet TO myk
  const sql = `
    SELECT
      DATE(timestamp) AS date,
      transaction_hash,
      to_address,
      CAST(value AS DOUBLE) / 1e6 AS amount_usdc
    FROM token_transfers
    WHERE chain_id = 8453
      AND contract_address = ${sqlString(USDC_BASE)}
      AND from_address = ${sqlString(HAT_WALLET.toLowerCase())}
      AND to_address = ${sqlString(MYK_ADDRESS.toLowerCase())}
    ORDER BY timestamp ASC
  `;

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await cdpQuery(sql);
  } catch {
    // Return empty summary on error
    return {
      taps: [],
      totalUsd: 0,
      lastTapDate: null,
      nextExpected: null,
      tapCount: 0,
      avgTapUsd: 0,
      firstTapDate: null,
    };
  }

  const taps: HatTap[] = rows.map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    amount: Number(r.amount_usdc ?? 0),
    txHash: String(r.transaction_hash ?? ""),
    to: String(r.to_address ?? ""),
  }));

  const totalUsd = taps.reduce((s, t) => s + t.amount, 0);
  const tapCount = taps.length;
  const avgTapUsd = tapCount > 0 ? totalUsd / tapCount : 0;
  const lastTapDate = taps.length > 0 ? taps[taps.length - 1].date : null;
  const firstTapDate = taps.length > 0 ? taps[0].date : null;
  const nextExpected = lastTapDate
    ? nextFriday(new Date(lastTapDate + "T00:00:00Z"))
    : null;

  return {
    taps,
    totalUsd,
    lastTapDate,
    nextExpected,
    tapCount,
    avgTapUsd,
    firstTapDate,
  };
}
