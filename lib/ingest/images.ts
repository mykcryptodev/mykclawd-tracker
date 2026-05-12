import { db } from "../../db/client";
import { tokens } from "../../db/schema";
import { eq } from "drizzle-orm";
import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { contractURI } from "thirdweb/extensions/common";
import { download, resolveScheme } from "thirdweb/storage";

const CG_BASE = "https://api.coingecko.com/api/v3";
const MISSING_ICON =
  "https://static.coingecko.com/s/missing_thumb_2x-38c6e63b2e37f3b16510adf55368db6d8d8e6385629f6e9d41557762b25a6eeb.png";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

function toHttpUrl(uri: string): string {
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return resolveScheme({ client, uri });
}

export async function resolveTokenImage(
  address: string,
  coingeckoId: string | null
): Promise<string | null> {
  // 1. CoinGecko
  if (coingeckoId) {
    try {
      const key = process.env.CG_DEMO_KEY;
      const res = await fetch(
        `${CG_BASE}/coins/${coingeckoId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
        { headers: key ? { "x-cg-demo-api-key": key } : {} }
      );
      if (res.ok) {
        const json = (await res.json()) as { image?: { large?: string } };
        const large = json?.image?.large;
        if (large && large !== MISSING_ICON) return large;
      }
    } catch { /* continue */ }
  }

  // 2. Thirdweb /v1/tokens API
  try {
    const params = new URLSearchParams({
      limit: "1",
      page: "1",
      chainId: base.id.toString(),
      tokenAddress: address,
    });
    const res = await fetch(`https://api.thirdweb.com/v1/tokens?${params}`, {
      headers: {
        accept: "application/json",
        "x-client-id": process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "",
      },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        tokens?: Array<{ iconUri?: string }>;
      };
      const iconUri = data.tokens?.[0]?.iconUri;
      if (iconUri && iconUri !== MISSING_ICON) return iconUri;
    }
  } catch { /* continue */ }

  const contract = getContract({
    client,
    chain: base,
    address: address as `0x${string}`,
  });

  // 3. tokenURI() — bankr/custom ERC20 tokens
  try {
    const uri = await readContract({
      contract,
      method: "function tokenURI() view returns (string)",
      params: [],
    });
    if (uri) {
      const res = await download({ client, uri });
      const metadata = (await res.json()) as { image?: string };
      if (metadata?.image) return toHttpUrl(metadata.image);
    }
  } catch { /* continue */ }

  // 4. imageUrl() — Clanker-style
  try {
    const url = await readContract({
      contract,
      method: "function imageUrl() view returns (string)",
      params: [],
    });
    if (url && typeof url === "string" && url !== "") return toHttpUrl(url);
  } catch { /* continue */ }

  // 5. contractURI() — Zora-style
  try {
    const uri = await contractURI({ contract });
    if (uri) {
      const res = await download({ client, uri });
      const metadata = (await res.json()) as { image?: string };
      if (metadata?.image) return toHttpUrl(metadata.image);
    }
  } catch { /* continue */ }

  return null;
}

export async function ingestImages(
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const unchecked = await db
    .select({
      contractAddress: tokens.contractAddress,
      coingeckoId: tokens.coingeckoId,
    })
    .from(tokens)
    .where(eq(tokens.imageChecked, false))
    .all();

  if (unchecked.length === 0) return 0;

  console.log(`  Resolving images for ${unchecked.length} tokens...`);
  let resolved = 0;

  for (let i = 0; i < unchecked.length; i++) {
    const { contractAddress, coingeckoId } = unchecked[i];
    onProgress?.(i + 1, unchecked.length);

    const imageUrl = await resolveTokenImage(contractAddress, coingeckoId);

    await db.update(tokens)
      .set({ imageUrl, imageChecked: true })
      .where(eq(tokens.contractAddress, contractAddress))
      .run();

    if (imageUrl) resolved++;
  }

  console.log(`  Resolved ${resolved}/${unchecked.length} token images`);
  return resolved;
}
