// Zapper GraphQL client — portfolio NAV + token holdings on Base.
//
// Docs: https://build.zapper.xyz/agents.txt
// NOTE: several Zapper docstrings claim a feature is "Worldchain only" (notably
// historicalPortfolio). That note is wrong — Base (chainId 8453) returns data, so
// we ignore it. Verified live against the tracked wallet.

const ZAPPER_ENDPOINT = "https://public.zapper.xyz/graphql";

/** Base mainnet. The only chain this tracker cares about. */
export const BASE_CHAIN_ID = 8453;

/**
 * Native ETH (the gas token) on Base. Zapper's historicalPortfolio EXCLUDES it
 * (verified: includeTokens:[this] → 0 ticks), so to keep our live NAV on the same
 * basis as the history we exclude it everywhere and surface it on its own card.
 */
export const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Drop dust below this USD value from the holdings list (NAV total still includes it). */
const MIN_POSITION_USD = 1;

/** Max `byToken` pages to walk (100 tokens each) before stopping. */
const MAX_TOKEN_PAGES = 5;

export interface ZapperToken {
  tokenAddress: string;
  symbol: string;
  name: string;
  network: string;
  imgUrl: string | null;
  price: number;
  balance: number;
  balanceRaw: string;
  balanceUsd: number;
}

export interface NativeEth {
  balance: number;
  balanceUsd: number;
  price: number;
}

export interface ZapperTokenBalances {
  /** NAV for the chain EXCLUDING native ETH — includes dust below MIN_POSITION_USD. */
  totalUsd: number;
  /** Holdings worth >= MIN_POSITION_USD, excluding native ETH, sorted by balanceUsd desc. */
  tokens: ZapperToken[];
  /** Native ETH held in the wallet, reported separately (never part of NAV). */
  nativeEth: NativeEth | null;
}

/**
 * Split native ETH out of a token list + total. Pure — unit-tested. Keeps the
 * remaining tokens (and the total minus ETH) on the same basis as Zapper history.
 */
export function excludeNativeEth(
  totalBalanceUSD: number,
  tokens: ZapperToken[]
): ZapperTokenBalances {
  const eth = tokens.find((t) => t.tokenAddress === NATIVE_ETH_ADDRESS) ?? null;
  return {
    totalUsd: totalBalanceUSD - (eth?.balanceUsd ?? 0),
    tokens: tokens.filter((t) => t.tokenAddress !== NATIVE_ETH_ADDRESS),
    nativeEth: eth
      ? { balance: eth.balance, balanceUsd: eth.balanceUsd, price: eth.price }
      : null,
  };
}

/** One daily point of the historical NAV curve. */
export interface NavTick {
  /** YYYY-MM-DD (UTC). */
  date: string;
  valueUsd: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function getApiKey(): string {
  const key = process.env.ZAPPER_API_KEY?.trim();
  if (!key) throw new Error("ZAPPER_API_KEY is not set");
  return key;
}

export async function zapperGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ZAPPER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zapper-api-key": getApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Zapper HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Zapper GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Zapper returned no data");
  return json.data;
}

// ── portfolioV2.tokenBalances ────────────────────────────────────────────────

const TOKEN_BALANCES_QUERY = /* GraphQL */ `
  query TokenBalances($addresses: [Address!]!, $chainIds: [Int!], $first: Int!, $after: String, $minBalanceUSD: Float) {
    portfolioV2(addresses: $addresses, chainIds: $chainIds) {
      tokenBalances {
        totalBalanceUSD
        byToken(first: $first, after: $after, filters: { minBalanceUSD: $minBalanceUSD }) {
          edges {
            node {
              tokenAddress
              symbol
              name
              price
              balance
              balanceRaw
              balanceUSD
              imgUrlV2
              network { name }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

interface TokenBalancesData {
  portfolioV2: {
    tokenBalances: {
      totalBalanceUSD: number;
      byToken: {
        edges: Array<{
          node: {
            tokenAddress: string;
            symbol: string | null;
            name: string | null;
            price: number | null;
            balance: number;
            balanceRaw: string;
            balanceUSD: number;
            imgUrlV2: string | null;
            network: { name: string } | null;
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
}

/** Current token holdings + NAV for `address` on Base. */
export async function fetchTokenBalances(
  address: string
): Promise<ZapperTokenBalances> {
  const tokens: ZapperToken[] = [];
  let totalUsd = 0;
  let after: string | null = null;

  for (let page = 0; page < MAX_TOKEN_PAGES; page++) {
    const data: TokenBalancesData = await zapperGraphQL<TokenBalancesData>(
      TOKEN_BALANCES_QUERY,
      {
        addresses: [address],
        chainIds: [BASE_CHAIN_ID],
        first: 100,
        after,
        minBalanceUSD: MIN_POSITION_USD,
      }
    );

    const tb = data.portfolioV2.tokenBalances;
    totalUsd = tb.totalBalanceUSD; // identical on every page; reflects full portfolio

    for (const { node } of tb.byToken.edges) {
      tokens.push({
        tokenAddress: node.tokenAddress.toLowerCase(),
        symbol: node.symbol ?? "",
        name: node.name ?? "",
        network: node.network?.name ?? "Base",
        imgUrl: node.imgUrlV2 ?? null,
        price: node.price ?? 0,
        balance: node.balance,
        balanceRaw: node.balanceRaw,
        balanceUsd: node.balanceUSD,
      });
    }

    if (!tb.byToken.pageInfo.hasNextPage || !tb.byToken.pageInfo.endCursor) break;
    after = tb.byToken.pageInfo.endCursor;
  }

  tokens.sort((a, b) => b.balanceUsd - a.balanceUsd);
  return excludeNativeEth(totalUsd, tokens);
}

// ── historicalPortfolio ──────────────────────────────────────────────────────

const HISTORICAL_QUERY = /* GraphQL */ `
  query HistoricalPortfolio($address: Address!, $chainId: Int!, $timeFrame: TimeFrame!) {
    historicalPortfolio(address: $address, chainId: $chainId, timeFrame: $timeFrame, currency: USD) {
      timestamp
      value
    }
  }
`;

interface HistoricalData {
  historicalPortfolio: Array<{ timestamp: number; value: number }>;
}

/** UTC YYYY-MM-DD for a unix-millisecond timestamp. */
function msToUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Collapse raw Zapper ticks (ms timestamp + value) to one ascending value per UTC
 * day (last tick of the day wins). Pure — unit-tested without the network.
 */
export function ticksToDailyNav(
  ticks: Array<{ timestamp: number; value: number }>
): NavTick[] {
  const byDate = new Map<string, number>();
  for (const tick of ticks) {
    byDate.set(msToUtcDate(tick.timestamp), tick.value);
  }

  return [...byDate.entries()]
    .map(([date, valueUsd]) => ({ date, valueUsd }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Year of daily NAV ticks for `address` on Base. Returns [] if Zapper has no
 * history for the wallet.
 */
export async function fetchHistoricalNav(
  address: string,
  timeFrame: "YEAR" | "MONTH" | "WEEK" | "DAY" = "YEAR"
): Promise<NavTick[]> {
  const data = await zapperGraphQL<HistoricalData>(HISTORICAL_QUERY, {
    address,
    chainId: BASE_CHAIN_ID,
    timeFrame,
  });

  return ticksToDailyNav(data.historicalPortfolio);
}
