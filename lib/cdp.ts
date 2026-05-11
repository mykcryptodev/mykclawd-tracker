const CDP_BASE = "https://api.cdp.coinbase.com/platform";

async function cdpGet(path: string): Promise<unknown> {
  const key = process.env.CDP_API_KEY;
  if (!key) throw new Error("CDP_API_KEY not set");

  const res = await fetch(`${CDP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CDP GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getTokenOwnership(address: string): Promise<string[]> {
  const data = (await cdpGet(
    `/v2/data/evm/token-ownership/base/${address}`
  )) as { tokenAddresses?: string[] };
  return (data.tokenAddresses ?? []).map((a) => a.toLowerCase());
}

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  rawAmount: string;
}

export async function getTokenBalances(
  address: string
): Promise<TokenBalance[]> {
  const results: TokenBalance[] = [];
  let pageToken: string | undefined;

  do {
    const qs = pageToken
      ? `?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
      : "?pageSize=100";
    const data = (await cdpGet(
      `/v2/data/evm/token-balances/base/${address}${qs}`
    )) as {
      balances?: Array<{
        amount: { amount: string; decimals: number };
        token: {
          symbol: string;
          name: string;
          contractAddress: string;
        };
      }>;
      nextPageToken?: string;
    };

    for (const b of data.balances ?? []) {
      results.push({
        contractAddress: b.token.contractAddress.toLowerCase(),
        symbol: b.token.symbol,
        name: b.token.name,
        decimals: b.amount.decimals,
        rawAmount: b.amount.amount,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}
