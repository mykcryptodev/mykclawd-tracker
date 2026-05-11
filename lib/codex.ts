const CODEX_URL = "https://graph.codex.io/graphql";
const BASE_CHAIN_ID = 8453;

async function codexQuery(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(CODEX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.CODEX_API_KEY ?? "",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Codex: ${json.errors[0].message}`);
  return json.data;
}

// Fetch total USD liquidity across all Base pools for a token.
// Returns null if the token has no Codex pair data.
export async function getCodexTokenLiquidity(
  tokenAddress: string
): Promise<number | null> {
  try {
    const data = (await codexQuery(
      `query GetLiquidity($addr: String!) {
        filterPairs(filters: { tokenAddress: $addr }) {
          results {
            pair { networkId }
            liquidity
          }
        }
      }`,
      { addr: tokenAddress.toLowerCase() }
    )) as {
      filterPairs?: {
        results?: Array<{ pair: { networkId: number }; liquidity: string | null }>;
      };
    };

    const results = (data?.filterPairs?.results ?? []).filter(
      (r) => r.pair.networkId === BASE_CHAIN_ID
    );

    if (results.length === 0) return null;

    const total = results.reduce(
      (s, r) => s + (parseFloat(r.liquidity ?? "0") || 0),
      0
    );
    return total;
  } catch {
    return null;
  }
}

// Fetch up to 365 days of daily closing prices for a token via its Base contract address.
// Returns [unixTimestampSeconds, priceUsd] pairs; empty if the token has no Codex data.
export async function getCodexDailyPrices(
  tokenAddress: string
): Promise<Array<[number, number]>> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 365 * 24 * 60 * 60;
  const symbol = `${tokenAddress.toLowerCase()}:${BASE_CHAIN_ID}`;

  try {
    const data = (await codexQuery(
      `query GetBars($symbol: String!, $from: Int!, $to: Int!, $resolution: String!) {
        getBars(symbol: $symbol, from: $from, to: $to, resolution: $resolution) {
          t
          c
        }
      }`,
      { symbol, from, to, resolution: "1D" }
    )) as { getBars?: { t: number[]; c: (number | null)[] } };

    const bars = data?.getBars;
    if (!bars?.t?.length) return [];

    const points: Array<[number, number]> = bars.t
      .map((ts, i) => [ts, bars.c[i]] as [number, number | null])
      .filter((entry): entry is [number, number] => entry[1] !== null && entry[1] > 0);

    // Reject tokens with any price > $100k — these are manipulated/rug-pull pools
    if (points.some(([, price]) => price > 100_000)) return [];

    return points;
  } catch {
    return [];
  }
}
