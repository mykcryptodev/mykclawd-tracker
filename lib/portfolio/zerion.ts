/**
 * Zerion REST API client — positions + per-token PnL on Base.
 *
 * Replaces the Zapper GraphQL client for live holdings data.
 * Auth: HTTP Basic with API key as the username, empty password.
 */

const BASE_URL = "https://api.zerion.io/v1";
const CHAIN = "base";
const MIN_VALUE_USD = 0.01;

function authHeader(): string {
  const key = process.env.ZERION_API_KEY ?? "";
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function zerionFetch<T>(path: string): Promise<T> {
  // Zerion requires a trailing slash — without it they return 301 which strips the
  // Authorization header on redirect (standard browser/fetch security behavior).
  const [pathname, qs] = path.split("?");
  const slashedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const url = `${BASE_URL}${slashedPath}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zerion ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZerionPositionAttributes {
  position_type: string;
  quantity: { float: number; numeric: string; decimals: number; int: string };
  value: number | null;
  price: number | null;
  changes: { absolute_1d: number | null; percent_1d: number | null } | null;
  fungible_info: {
    name: string;
    symbol: string;
    icon: { url: string } | null;
    flags: { verified: boolean };
    implementations: Array<{ chain_id: string; address: string; decimals: number }>;
  };
}

interface ZerionPosition {
  type: "positions";
  id: string;
  attributes: ZerionPositionAttributes;
}

interface ZerionPositionsResponse {
  data: ZerionPosition[];
  links: { next?: string };
}

interface ZerionPnlAttributes {
  total_gain: number;
  realized_gain: number;
  unrealized_gain: number;
  relative_total_gain_percentage: number;
  relative_realized_gain_percentage: number;
  relative_unrealized_gain_percentage: number;
  total_invested: number;
  net_invested: number;
  realized_cost_basis: number;
}

interface ZerionPnlResponse {
  data: {
    type: "wallet_pnl";
    id: string;
    attributes: ZerionPnlAttributes;
  };
}

// ─── Exported shapes ─────────────────────────────────────────────────────────

export interface ZerionToken {
  tokenAddress: string; // lowercase contract address, or "native" for ETH
  symbol: string;
  name: string;
  imgUrl: string | null;
  price: number;
  balance: number;
  balanceRaw: string;
  balanceUsd: number;
  change1dUsd: number | null;
  change1dPct: number | null;
  isNative: boolean;
}

export interface ZerionTokenPnl {
  tokenAddress: string;
  realizedGain: number;
  unrealizedGain: number;
  totalGain: number;
  totalGainPct: number;
  realizedGainPct: number;
  unrealizedGainPct: number;
  totalInvested: number;
}

export interface ZerionHoldings {
  tokens: ZerionToken[];
  nativeEth: ZerionToken | null;
  totalUsd: number; // excludes native ETH to match Zapper historical basis
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function fetchZerionPositions(address: string): Promise<ZerionHoldings> {
  const url =
    `/wallets/${address}/positions` +
    `?filter[chain_ids]=${CHAIN}` +
    `&filter[position_types]=wallet` +
    `&currency=usd` +
    `&sort=-value`;

  const data = await zerionFetch<ZerionPositionsResponse>(url);
  const positions = data.data ?? [];

  const tokens: ZerionToken[] = [];
  let nativeEth: ZerionToken | null = null;
  let totalUsd = 0;

  for (const pos of positions) {
    const attr = pos.attributes;
    const info = attr.fungible_info;
    const value = attr.value ?? 0;

    if (value < MIN_VALUE_USD) continue;

    // Find Base implementation address
    const impl = info.implementations.find((i) => i.chain_id === CHAIN);
    const isNative = !impl; // ETH has no Base implementation entry
    const tokenAddress = isNative ? "native" : (impl?.address ?? "").toLowerCase();

    const token: ZerionToken = {
      tokenAddress,
      symbol: info.symbol,
      name: info.name,
      imgUrl: info.icon?.url ?? null,
      price: attr.price ?? 0,
      balance: attr.quantity.float,
      balanceRaw: attr.quantity.int,
      balanceUsd: value,
      change1dUsd: attr.changes?.absolute_1d ?? null,
      change1dPct: attr.changes?.percent_1d ?? null,
      isNative,
    };

    if (isNative) {
      nativeEth = token;
    } else {
      tokens.push(token);
      totalUsd += value;
    }
  }

  tokens.sort((a, b) => b.balanceUsd - a.balanceUsd);

  return { tokens, nativeEth, totalUsd };
}

// ─── Per-token PnL ────────────────────────────────────────────────────────────

/**
 * Fetches PnL for one token on Base. Pass the contract address.
 * Returns null if Zerion has no cost-basis data for it.
 */
export async function fetchZerionTokenPnl(
  walletAddress: string,
  tokenAddress: string // lowercase contract address
): Promise<ZerionTokenPnl | null> {
  try {
    const impl = `${CHAIN}:${tokenAddress}`;
    const url =
      `/wallets/${walletAddress}/pnl` +
      `?currency=usd` +
      `&filter[fungible_implementations]=${encodeURIComponent(impl)}`;

    const data = await zerionFetch<ZerionPnlResponse>(url);
    const attr = data.data?.attributes;
    if (!attr) return null;

    return {
      tokenAddress,
      realizedGain: attr.realized_gain,
      unrealizedGain: attr.unrealized_gain,
      totalGain: attr.total_gain,
      totalGainPct: attr.relative_total_gain_percentage,
      realizedGainPct: attr.relative_realized_gain_percentage,
      unrealizedGainPct: attr.relative_unrealized_gain_percentage,
      totalInvested: attr.total_invested,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches PnL for multiple tokens in parallel (capped concurrency to avoid rate limits).
 */
export async function fetchZerionPnlBatch(
  walletAddress: string,
  tokenAddresses: string[],
  concurrency = 5
): Promise<Map<string, ZerionTokenPnl>> {
  const result = new Map<string, ZerionTokenPnl>();
  const queue = [...tokenAddresses];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const settled = await Promise.allSettled(
      batch.map((addr) => fetchZerionTokenPnl(walletAddress, addr))
    );
    for (let i = 0; i < batch.length; i++) {
      const s = settled[i];
      if (s.status === "fulfilled" && s.value) {
        result.set(batch[i], s.value);
      }
    }
    // Small pause between batches to be nice to the API
    if (queue.length > 0) await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}
