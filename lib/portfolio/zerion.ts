/**
 * Zerion REST API client — positions, wallet NAV history, and per-token PnL on Base.
 *
 * Auth: HTTP Basic with API key as the username, empty password.
 */

const BASE_URL = "https://api.zerion.io/v1";
const CHAIN = "base";
const MIN_VALUE_USD = 0.01;
const MAX_POSITION_PAGES = 10;

/** Native ETH on Base, normalized to Basescan's zero-address convention. */
export const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

function authHeader(): string {
  const key = process.env.ZERION_API_KEY ?? "";
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function zerionFetch<T>(pathOrUrl: string): Promise<T> {
  // Zerion requires a trailing slash — without it they return 301 which strips the
  // Authorization header on redirect (standard browser/fetch security behavior).
  const isAbsolute = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://");
  const rawUrl = isAbsolute ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const parsed = new URL(rawUrl);
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;

  const res = await fetch(parsed.toString(), {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zerion ${pathOrUrl} -> ${res.status}: ${text.slice(0, 200)}`);
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
    implementations: Array<{ chain_id: string; address: string | null; decimals: number }>;
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

interface ZerionChartResponse {
  data: {
    type: "wallet_chart";
    id: string;
    attributes: {
      points: Array<[number, number]>;
    };
  };
}

// ─── Exported shapes ─────────────────────────────────────────────────────────

export interface ZerionToken {
  tokenAddress: string; // lowercase contract address, or zero address for native ETH
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
  totalUsd: number; // includes native ETH, matching Zerion wallet chart history
}

/** One daily point of the wallet NAV curve. */
export interface NavTick {
  /** YYYY-MM-DD (UTC). */
  date: string;
  valueUsd: number;
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function fetchZerionPositions(address: string): Promise<ZerionHoldings> {
  let nextUrl: string | null =
    `/wallets/${address}/positions` +
    `?filter[chain_ids]=${CHAIN}` +
    `&filter[position_types]=wallet` +
    `&currency=usd` +
    `&sort=-value`;

  const positions: ZerionPosition[] = [];

  for (let page = 0; nextUrl && page < MAX_POSITION_PAGES; page++) {
    const response: ZerionPositionsResponse = await zerionFetch<ZerionPositionsResponse>(nextUrl);
    positions.push(...(response.data ?? []));
    nextUrl = response.links?.next ?? null;
  }

  const tokens: ZerionToken[] = [];
  let nativeEth: ZerionToken | null = null;
  let totalUsd = 0;

  for (const pos of positions) {
    const attr = pos.attributes;
    const info = attr.fungible_info;
    const value = attr.value ?? 0;

    if (value < MIN_VALUE_USD) continue;

    totalUsd += value;

    // Find Base implementation address. Zerion models native gas assets as an
    // implementation for the chain with `address: null`, not as a missing impl.
    const impl = info.implementations.find((i) => i.chain_id === CHAIN);
    const implAddress = impl?.address;
    const isNative = !implAddress;
    const tokenAddress = implAddress ? implAddress.toLowerCase() : NATIVE_ETH_ADDRESS;

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
    }
  }

  tokens.sort((a, b) => b.balanceUsd - a.balanceUsd);

  return { tokens, nativeEth, totalUsd };
}

// ─── Wallet NAV chart ────────────────────────────────────────────────────────

/** UTC YYYY-MM-DD for a unix-second timestamp. */
function secondsToUtcDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Collapse raw Zerion chart points (unix seconds + value) to one ascending value
 * per UTC day. If Zerion returns multiple points for a day, the last point wins.
 */
export function pointsToDailyNav(points: Array<[number, number]>): NavTick[] {
  const byDate = new Map<string, number>();
  for (const [timestamp, value] of points) {
    byDate.set(secondsToUtcDate(timestamp), value);
  }

  return [...byDate.entries()]
    .map(([date, valueUsd]) => ({ date, valueUsd }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Year of Base wallet NAV ticks from Zerion. The values include native ETH,
 * matching `fetchZerionPositions().totalUsd`.
 */
export async function fetchZerionWalletNav(address: string): Promise<NavTick[]> {
  const data = await zerionFetch<ZerionChartResponse>(
    `/wallets/${address}/charts/year?currency=usd&filter[chain_ids]=${CHAIN}`
  );

  return pointsToDailyNav(data.data?.attributes?.points ?? []);
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

// ─── Per-token transactions (trade history for the holding detail page) ───────

interface ZerionTransferAttr {
  direction: "in" | "out" | "self";
  quantity: { float: number };
  price: number | null;
  value: number | null;
  fungible_info?: {
    symbol: string;
    implementations: Array<{ chain_id: string; address: string | null; decimals: number }>;
  };
}

interface ZerionTransaction {
  id: string;
  attributes: {
    operation_type: string;
    hash: string;
    mined_at: string; // ISO
    status: string;
    transfers: ZerionTransferAttr[];
  };
}

interface ZerionTransactionsResponse {
  data: ZerionTransaction[];
  links: { next?: string | null };
}

export type TokenTradeAction = "buy" | "sell" | "send" | "receive" | "other";

export interface TokenTrade {
  hash: string;
  minedAt: number; // unix seconds
  operationType: string;
  action: TokenTradeAction;
  /** Quantity of the target token moved in this tx (positive). */
  tokenQty: number;
  /** Execution price of the target token at tx time (from Zerion). */
  tokenPriceUsd: number | null;
  /** USD value of the target token leg at tx time. */
  tokenValueUsd: number | null;
  /** The other side of a trade, e.g. "USDC" / "WETH". */
  counterSymbol: string | null;
  counterQty: number | null;
  counterValueUsd: number | null;
}

export interface TokenTradeHistory {
  trades: TokenTrade[];
  truncated: boolean;
  maxPages: number;
}

function transferMatchesToken(t: ZerionTransferAttr, tokenAddress: string, isNative: boolean): boolean {
  const impl = t.fungible_info?.implementations?.find((i) => i.chain_id === CHAIN);
  if (!impl) return false;
  if (isNative) return !impl.address;
  return (impl.address ?? "").toLowerCase() === tokenAddress;
}

function classifyAction(operationType: string, direction: "in" | "out" | "self"): TokenTradeAction {
  if (operationType === "trade") return direction === "in" ? "buy" : "sell";
  if (direction === "in") return "receive";
  if (direction === "out") return "send";
  return "other";
}

/**
 * Full transaction history for one token in the tracked wallet, newest first.
 * Uses Zerion execution-time prices/values — the same source as positions/PnL.
 */
export async function fetchTokenTradeHistory(
  walletAddress: string,
  tokenAddress: string, // lowercase; zero address = native ETH
  maxPages = 25
): Promise<TokenTradeHistory> {
  const isNative = tokenAddress === NATIVE_ETH_ADDRESS;
  const tokenFilter = isNative
    ? `filter[fungible_ids]=eth`
    : `filter[fungible_implementations]=${encodeURIComponent(`${CHAIN}:${tokenAddress}`)}`;

  let nextUrl: string | null =
    `/wallets/${walletAddress}/transactions` +
    `?currency=usd&filter[chain_ids]=${CHAIN}&${tokenFilter}&page[size]=100`;

  const trades: TokenTrade[] = [];

  for (let page = 0; nextUrl && page < maxPages; page++) {
    const res: ZerionTransactionsResponse = await zerionFetch<ZerionTransactionsResponse>(nextUrl);

    for (const tx of res.data ?? []) {
      const attr = tx.attributes;
      if (attr.status !== "confirmed") continue;

      const tokenLegs = (attr.transfers ?? []).filter((t) =>
        transferMatchesToken(t, tokenAddress, isNative)
      );
      if (tokenLegs.length === 0) continue;

      // A tx can have several token legs (e.g. multi-hop); aggregate per direction
      // and report the dominant one so one row == one user-visible action.
      const sum = (dir: "in" | "out") =>
        tokenLegs
          .filter((t) => t.direction === dir)
          .reduce(
            (acc, t) => ({
              qty: acc.qty + (t.quantity?.float ?? 0),
              value: acc.value + (t.value ?? 0),
              price: t.price ?? acc.price,
            }),
            { qty: 0, value: 0, price: null as number | null }
          );

      const inn = sum("in");
      const out = sum("out");
      const net = inn.qty - out.qty;
      if (inn.qty === 0 && out.qty === 0) continue;

      const direction: "in" | "out" = net >= 0 ? "in" : "out";
      const side = direction === "in" ? inn : out;

      // Counter leg: the largest non-target transfer in the opposite direction.
      const counter = (attr.transfers ?? [])
        .filter(
          (t) =>
            !transferMatchesToken(t, tokenAddress, isNative) &&
            t.direction !== direction &&
            (t.value ?? 0) > 0
        )
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

      trades.push({
        hash: attr.hash,
        minedAt: Math.floor(new Date(attr.mined_at).getTime() / 1000),
        operationType: attr.operation_type,
        action: classifyAction(attr.operation_type, direction),
        tokenQty: Math.abs(net) > 0 ? Math.abs(net) : side.qty,
        tokenPriceUsd: side.price,
        tokenValueUsd: side.value > 0 ? side.value : null,
        counterSymbol: counter?.fungible_info?.symbol ?? null,
        counterQty: counter?.quantity?.float ?? null,
        counterValueUsd: counter?.value ?? null,
      });
    }

    nextUrl = res.links?.next ?? null;
  }

  trades.sort((a, b) => b.minedAt - a.minedAt);
  return {
    trades,
    truncated: nextUrl !== null,
    maxPages,
  };
}

export async function fetchTokenTrades(
  walletAddress: string,
  tokenAddress: string,
  maxPages = 25
): Promise<TokenTrade[]> {
  return (await fetchTokenTradeHistory(walletAddress, tokenAddress, maxPages)).trades;
}

// ─── Token price chart ────────────────────────────────────────────────────────

export interface PricePoint {
  ts: number; // unix seconds
  price: number;
}

export type ChartPeriod = "day" | "week" | "month" | "year" | "max";

interface ZerionFungiblesResponse {
  data: Array<{ id: string; attributes: { symbol: string } }>;
}

interface ZerionFungibleChartResponse {
  data: { attributes: { points: Array<[number, number]> } };
}

/** Resolve a Base contract address to Zerion's fungible id ("eth" for native). */
export async function fetchZerionFungibleId(tokenAddress: string): Promise<string | null> {
  if (tokenAddress === NATIVE_ETH_ADDRESS) return "eth";
  const res = await zerionFetch<ZerionFungiblesResponse>(
    `/fungibles/?filter[implementation_chain_id]=${CHAIN}` +
      `&filter[implementation_address]=${tokenAddress}`
  );
  return res.data?.[0]?.id ?? null;
}

export async function fetchZerionFungibleChart(
  fungibleId: string,
  period: ChartPeriod
): Promise<PricePoint[]> {
  const res = await zerionFetch<ZerionFungibleChartResponse>(
    `/fungibles/${fungibleId}/charts/${period}?currency=usd`
  );
  return (res.data?.attributes?.points ?? [])
    .map(([ts, price]) => ({ ts, price }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.ts - b.ts);
}

// ─── GeckoTerminal price chart fallback ──────────────────────────────────────

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";
const GECKO_NETWORK = "base";
const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

interface GeckoPool {
  id: string;
  attributes: {
    address: string;
    reserve_in_usd: string | null;
  };
  relationships: {
    base_token?: { data?: { id: string } | null };
    quote_token?: { data?: { id: string } | null };
  };
}

interface GeckoPoolsResponse {
  data: GeckoPool[];
}

interface GeckoOhlcvResponse {
  data: {
    attributes: {
      ohlcv_list: Array<[number, number, number, number, number, number]>;
    };
  };
}

async function geckoFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${GECKO_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 15 * 60 },
  } as RequestInit & { next: { revalidate: number } });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GeckoTerminal ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

function asFiniteNumber(value: string | number | null | undefined): number | null {
  const n = typeof value === "number" ? value : value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function geckoAddressFor(tokenAddress: string): string {
  return tokenAddress === NATIVE_ETH_ADDRESS ? BASE_WETH_ADDRESS : tokenAddress.toLowerCase();
}

function geckoTokenId(tokenAddress: string): string {
  return `${GECKO_NETWORK}_${geckoAddressFor(tokenAddress)}`;
}

function poolTokenSide(pool: GeckoPool, tokenAddress: string): "base" | "quote" | null {
  const target = geckoTokenId(tokenAddress);
  if (pool.relationships.base_token?.data?.id?.toLowerCase() === target) return "base";
  if (pool.relationships.quote_token?.data?.id?.toLowerCase() === target) return "quote";
  return null;
}

async function bestGeckoPool(tokenAddress: string): Promise<{
  address: string;
  side: "base" | "quote";
} | null> {
  const address = geckoAddressFor(tokenAddress);
  const data = await geckoFetch<GeckoPoolsResponse>(
    `/networks/${GECKO_NETWORK}/tokens/${address}/pools?page=1`
  );

  const pools = (data.data ?? [])
    .map((pool) => ({
      pool,
      side: poolTokenSide(pool, tokenAddress),
      reserveUsd: asFiniteNumber(pool.attributes.reserve_in_usd) ?? 0,
    }))
    .filter((p): p is { pool: GeckoPool; side: "base" | "quote"; reserveUsd: number } =>
      p.side !== null
    )
    .sort((a, b) => b.reserveUsd - a.reserveUsd);

  const best = pools[0];
  if (!best) return null;
  return { address: best.pool.attributes.address.toLowerCase(), side: best.side };
}

async function fetchGeckoTerminalChart(
  pool: { address: string; side: "base" | "quote" },
  period: "week" | "month" | "max"
): Promise<PricePoint[]> {
  const cfg =
    period === "week"
      ? { timeframe: "hour", aggregate: 1, limit: 24 * 7 }
      : period === "month"
        ? { timeframe: "hour", aggregate: 4, limit: 31 * 6 }
        : { timeframe: "day", aggregate: 1, limit: 1000 };

  const data = await geckoFetch<GeckoOhlcvResponse>(
    `/networks/${GECKO_NETWORK}/pools/${pool.address}/ohlcv/${cfg.timeframe}` +
      `?aggregate=${cfg.aggregate}&limit=${cfg.limit}&currency=usd&token=${pool.side}`
  );

  return (data.data?.attributes?.ohlcv_list ?? [])
    .map(([ts, , , , close]) => ({ ts, price: close }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.ts - b.ts);
}

export async function fetchFallbackTokenChartSeries(tokenAddress: string): Promise<{
  week: PricePoint[];
  month: PricePoint[];
  max: PricePoint[];
}> {
  const pool = await bestGeckoPool(tokenAddress).catch(() => null);
  if (!pool) return { week: [], month: [], max: [] };

  const [week, month, max] = await Promise.all([
    fetchGeckoTerminalChart(pool, "week").catch(() => []),
    fetchGeckoTerminalChart(pool, "month").catch(() => []),
    fetchGeckoTerminalChart(pool, "max").catch(() => []),
  ]);

  return { week, month, max };
}
