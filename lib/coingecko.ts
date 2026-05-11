import Bottleneck from "bottleneck";

const CG_BASE = "https://api.coingecko.com/api/v3";

const limiter = new Bottleneck({ minTime: 2500, maxConcurrent: 1 });

async function cgFetch(path: string): Promise<unknown> {
  const key = process.env.CG_DEMO_KEY;
  const res = await fetch(`${CG_BASE}${path}`, {
    headers: key ? { "x-cg-demo-api-key": key } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoinGecko ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

const cgFetchLimited = limiter.wrap(cgFetch);

type CoinEntry = { id: string; platforms: Record<string, string> };

// In-process cache: fetched once per sync run, reused across all lookups.
let _coinsListCache: Map<string, string> | null = null; // base_address_lower → coin_id

// Fetches the full CoinGecko coin list with platform addresses and builds
// a lookup map for "base" platform. One HTTP call per process lifetime.
async function getBaseContractMap(): Promise<Map<string, string>> {
  if (_coinsListCache) return _coinsListCache;
  const list = (await cgFetchLimited(
    "/coins/list?include_platform=true"
  )) as CoinEntry[];
  const map = new Map<string, string>();
  for (const coin of list) {
    const addr = coin.platforms?.["base"];
    if (addr) map.set(addr.toLowerCase(), coin.id);
  }
  _coinsListCache = map;
  return map;
}

// Look up CoinGecko coin id by contract address on Base.
// Uses a bulk-fetched list so this is a local dict lookup after the first call.
export async function getCoinIdByContract(
  _platform: string,
  contractAddress: string
): Promise<string | null> {
  try {
    const map = await getBaseContractMap();
    return map.get(contractAddress.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}

// Invalidate the in-process cache (call at start of each sync to get fresh data).
export function invalidateCoinsListCache() {
  _coinsListCache = null;
}

// Returns daily close prices for the past `days` days.
// Result: array of [unixTimestampMs, priceUsd]
export async function getDailyPrices(
  coinId: string,
  days: number
): Promise<Array<[number, number]>> {
  const data = (await cgFetchLimited(
    `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
  )) as { prices?: Array<[number, number]> };
  return data.prices ?? [];
}

// Returns the USD price for a specific date (YYYY-MM-DD).
export async function getPriceOnDate(
  coinId: string,
  dateStr: string
): Promise<number | null> {
  // dateStr: YYYY-MM-DD → CoinGecko wants DD-MM-YYYY
  const [y, m, d] = dateStr.split("-");
  const cgDate = `${d}-${m}-${y}`;
  try {
    const data = (await cgFetchLimited(
      `/coins/${coinId}/history?date=${cgDate}&localization=false`
    )) as { market_data?: { current_price?: { usd?: number } } };
    return data.market_data?.current_price?.usd ?? null;
  } catch {
    return null;
  }
}
