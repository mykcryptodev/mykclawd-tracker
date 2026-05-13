import { db } from "../../db/client";
import { tokens } from "../../db/schema";
import { getCoinIdByContract, invalidateCoinsListCache } from "../coingecko";
import { getZerionId } from "../zerion";
import { publicClient, NATIVE_TOKEN_ADDRESS } from "../rpc";
import { eq, and } from "drizzle-orm";
import { erc20Abi } from "viem";

async function fetchErc20Meta(
  contractAddress: `0x${string}`
): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    const [symbol, name, decimals] = await Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: erc20Abi,
        functionName: "name",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    return { symbol: symbol as string, name: name as string, decimals: Number(decimals) };
  } catch {
    return { symbol: "", name: "", decimals: 18 };
  }
}

// Ensures ETH and discovered ERC-20 tokens have metadata + CoinGecko IDs.
// Token addresses come from the transfers table (populated during transfer ingest).
export async function enrichTokens(): Promise<number> {
  let added = 0;
  invalidateCoinsListCache(); // ensure fresh list each sync run

  // Native ETH is represented as a pseudo-token so the normal pricing/PnL
  // pipeline can treat it like any other holding.
  const ethMeta = {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    coingeckoId: "ethereum",
    isPriced: true,
    cgChecked: true,
  };
  const ethRow = await db
    .select()
    .from(tokens)
    .where(eq(tokens.contractAddress, NATIVE_TOKEN_ADDRESS))
    .get();
  await db.insert(tokens)
    .values({
      contractAddress: NATIVE_TOKEN_ADDRESS,
      ...ethMeta,
    })
    .onConflictDoUpdate({
      target: tokens.contractAddress,
      set: ethMeta,
    })
    .run();
  if (!ethRow) added++;

  // Fill metadata for tokens with empty symbol (discovered but not yet enriched)
  const unenriched = (await db
    .select()
    .from(tokens)
    .where(eq(tokens.symbol, ""))
    .all())
    .filter((t) => t.contractAddress !== NATIVE_TOKEN_ADDRESS);

  for (const token of unenriched) {
    const meta = await fetchErc20Meta(token.contractAddress as `0x${string}`);
    await db.update(tokens)
      .set(meta)
      .where(eq(tokens.contractAddress, token.contractAddress))
      .run();
  }

  // Resolve CoinGecko IDs for tokens not yet checked (avoids re-querying 404s on next sync)
  const unresolved = (await db
    .select()
    .from(tokens)
    .where(eq(tokens.cgChecked, false))
    .all())
    .filter((t) => t.contractAddress !== NATIVE_TOKEN_ADDRESS);

  for (const token of unresolved) {
    const cgId = await getCoinIdByContract("base", token.contractAddress);
    await db.update(tokens)
      .set(cgId
        ? { coingeckoId: cgId, isPriced: true, cgChecked: true }
        : { cgChecked: true })
      .where(eq(tokens.contractAddress, token.contractAddress))
      .run();
  }

  // Zerion fallback: check tokens that failed CoinGecko and haven't been checked on Zerion yet
  const zerionUnresolved = (await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.cgChecked, true), eq(tokens.isPriced, false), eq(tokens.zerionChecked, false)))
    .all())
    .filter((t) => t.contractAddress !== NATIVE_TOKEN_ADDRESS);

  if (zerionUnresolved.length > 0) {
    console.log(`  Checking ${zerionUnresolved.length} tokens on Zerion...`);
    let zerionFound = 0;
    for (const token of zerionUnresolved) {
      const zId = await getZerionId(token.contractAddress);
      await db.update(tokens)
        .set(zId
          ? { zerionId: zId, isPriced: true, zerionChecked: true }
          : { zerionChecked: true })
        .where(eq(tokens.contractAddress, token.contractAddress))
        .run();
      if (zId) zerionFound++;
      await new Promise((r) => setTimeout(r, 100)); // light rate limiting
    }
    console.log(`  Zerion: ${zerionFound}/${zerionUnresolved.length} tokens found`);
  }

  return added;
}
