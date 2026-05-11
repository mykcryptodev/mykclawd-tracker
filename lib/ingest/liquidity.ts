import { db } from "../../db/client";
import { tokens, prices } from "../../db/schema";
import { getCodexTokenLiquidity } from "../codex";
import { eq } from "drizzle-orm";

export async function ingestLiquidity(
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const rows = db
    .select({ tokenAddress: prices.tokenAddress })
    .from(prices)
    .where(eq(prices.source, "codex"))
    .all();

  const unique = [...new Set(rows.map((r) => r.tokenAddress))];
  if (unique.length === 0) return 0;

  console.log(`  Fetching liquidity for ${unique.length} Codex-priced tokens...`);
  let updated = 0;

  for (let i = 0; i < unique.length; i++) {
    const addr = unique[i];
    onProgress?.(i + 1, unique.length);

    const liq = await getCodexTokenLiquidity(addr);
    if (liq !== null) {
      db.update(tokens)
        .set({ liquidityUsd: liq })
        .where(eq(tokens.contractAddress, addr))
        .run();
      updated++;
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  return updated;
}
