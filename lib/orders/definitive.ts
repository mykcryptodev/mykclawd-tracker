/**
 * Definitive order fetcher.
 *
 * - **Flash API** (integrator keys `dpka_*`): GET /v2/flash/orders?funderAddress=…
 *   Auth: `x-definitive-api-key` only — https://flash.definitive.fi/docs/for-agents
 * - **Portfolio API** (optional): GET /v2/portfolio/orders with HMAC secret (`dpks_*`)
 *
 * Requires: DEFINITIVE_API_KEY
 * Optional: DEFINITIVE_API_SECRET (portfolio HMAC only)
 */

import { createHmac } from "crypto";

// Definitive moved the Flash host; default to the latest domain while allowing
// overrides so we can quickly adapt if they change again.
const FLASH_BASE =
  process.env.DEFINITIVE_FLASH_BASE?.trim() || "https://flash.definitive.fi/v2/flash";
const PORTFOLIO_BASE =
  process.env.DEFINITIVE_PORTFOLIO_BASE?.trim() || "https://flash.definitive.fi";

/** Flash list endpoint max `pageSize` per request (OpenAPI). */
export const DEFINITIVE_FLASH_PAGE_SIZE = 200;

/**
 * Flash has no offset/cursor — only `pageSize` (max 200). When `statuses` is omitted,
 * the 200 slots are shared across all statuses (newest first). We query each status
 * separately so filled/cancelled rows do not crowd out open/partial history.
 */
export const DEFINITIVE_FLASH_STATUSES = [
  "ORDER_STATUS_PENDING",
  "ORDER_STATUS_ACCEPTED",
  "ORDER_STATUS_PARTIALLY_FILLED",
  "ORDER_STATUS_FILLED",
  "ORDER_STATUS_CANCELLED",
  "ORDER_STATUS_REJECTED",
  "ORDER_STATUS_TERMINATED",
] as const;

export interface DefinitiveOrder {
  source: "definitive";
  orderId: string;
  status: string;
  type: string;
  side: "buy" | "sell";
  chain: string;
  targetAsset: string;
  targetSymbol: string | null;
  contraAsset: string;
  contraSymbol: string | null;
  quantity: string;
  filledQuantity: string | null;
  priceUsd: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface DefinitiveAssetObject {
  address?: string;
  ticker?: string;
  chain?: { id?: string; name?: string };
}

interface DefinitiveFilledObject {
  targetAmount?: string | null;
  contraAmount?: string | null;
  averagePrice?: string | null;
  averageNotionalPrice?: string | null;
}

interface RawDefinitiveOrder {
  id?: string;
  orderId?: string;
  status?: string;
  type?: string;
  orderType?: string;
  side?: string;
  orderSide?: string;
  chain?: string | { id?: string; name?: string };
  targetAsset?: string | DefinitiveAssetObject;
  targetSymbol?: string;
  contraAsset?: string | DefinitiveAssetObject;
  contraSymbol?: string;
  qty?: string;
  quantity?: string;
  filled?: DefinitiveFilledObject | null;
  filledQty?: string;
  filledQuantity?: string;
  price?: number;
  priceUsd?: number;
  limitPrice?: string;
  limitNotionalPrice?: string | null;
  averagePrice?: string;
  createdAt?: string;
  placedAt?: string;
  orderDate?: string;
  updatedAt?: string;
  completedAt?: string;
  closedAt?: string | null;
  acceptedAt?: string | null;
}

interface PrehashParams {
  method: "GET" | "POST" | "DELETE";
  path: string;
  timestamp: string;
  queryParams?: Record<string, string>;
  body?: string;
}

function usePortfolioApi(): boolean {
  return Boolean(
    process.env.DEFINITIVE_API_KEY?.trim() && process.env.DEFINITIVE_API_SECRET?.trim()
  );
}

/** Extract a lowercase EVM address from a string or Definitive asset object. */
export function parseDefinitiveAssetAddress(asset: string | DefinitiveAssetObject | undefined): string {
  if (!asset) return "";
  if (typeof asset === "string") {
    const trimmed = asset.trim().toLowerCase();
    return trimmed.startsWith("0x") ? trimmed : "";
  }
  const addr = asset.address?.trim().toLowerCase() ?? "";
  return addr.startsWith("0x") ? addr : "";
}

export function parseDefinitiveAssetSymbol(
  asset: string | DefinitiveAssetObject | undefined,
  fallback?: string
): string | null {
  if (fallback?.trim()) return fallback.trim();
  if (asset && typeof asset === "object" && asset.ticker?.trim()) {
    return asset.ticker.trim();
  }
  return null;
}

export function parseDefinitiveSide(raw?: string): "buy" | "sell" {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("SELL")) return "sell";
  if (s.includes("BUY")) return "buy";
  return "buy";
}

export function normalizeDefinitiveStatus(raw?: string): string {
  const s = (raw ?? "").toUpperCase();
  if (!s) return "unknown";
  if (s.includes("PARTIAL")) return "partial";
  if (s.includes("FILLED")) return "filled";
  if (s.includes("CANCEL") || s.includes("REJECT") || s.includes("TERMINAT")) return "cancelled";
  if (s.includes("EXPIRED")) return "expired";
  if (s.includes("PENDING")) return "pending";
  if (s.includes("OPEN") || s.includes("ACCEPTED") || s.includes("ACTIVE")) return "open";
  return s.replace(/^ORDER_STATUS_/, "").toLowerCase() || "unknown";
}

export function normalizeDefinitiveType(raw?: string): string {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("LIMIT")) return "limit";
  if (s.includes("TWAP")) return "twap";
  if (s.includes("STOP")) return "stop";
  if (s.includes("MARKET")) return "market";
  if (s.includes("BRACKET")) return "bracket";
  return (raw ?? "market").replace(/^ORDER_TYPE_/, "").toLowerCase() || "market";
}

function parseDefinitiveChain(chain: RawDefinitiveOrder["chain"]): string {
  if (!chain) return "base";
  if (typeof chain === "string") return chain;
  const id = chain.id ?? "";
  if (id === "8453") return "base";
  return chain.name?.toLowerCase() ?? id ?? "base";
}

function parseFilledQuantity(o: RawDefinitiveOrder): string | null {
  if (o.filled?.targetAmount) return o.filled.targetAmount;
  return o.filledQty ?? o.filledQuantity ?? null;
}

function parsePriceUsd(o: RawDefinitiveOrder): number | null {
  if (o.priceUsd != null) return o.priceUsd;
  if (o.price != null) return o.price;
  const limit = o.limitNotionalPrice ? Number(o.limitNotionalPrice) : NaN;
  if (Number.isFinite(limit)) return limit;
  const avg = o.filled?.averageNotionalPrice
    ? Number(o.filled.averageNotionalPrice)
    : o.averagePrice
      ? Number(o.averagePrice)
      : NaN;
  return Number.isFinite(avg) ? avg : null;
}

export function mapDefinitiveOrder(o: RawDefinitiveOrder): DefinitiveOrder {
  const targetAsset = parseDefinitiveAssetAddress(o.targetAsset);
  const contraAsset = parseDefinitiveAssetAddress(o.contraAsset);

  return {
    source: "definitive",
    orderId: o.orderId ?? o.id ?? "",
    status: normalizeDefinitiveStatus(o.status),
    type: normalizeDefinitiveType(o.orderType ?? o.type),
    side: parseDefinitiveSide(o.side ?? o.orderSide),
    chain: parseDefinitiveChain(o.chain ?? (typeof o.targetAsset === "object" ? o.targetAsset?.chain : undefined)),
    targetAsset,
    targetSymbol: parseDefinitiveAssetSymbol(o.targetAsset, o.targetSymbol),
    contraAsset,
    contraSymbol: parseDefinitiveAssetSymbol(o.contraAsset, o.contraSymbol),
    quantity: o.qty ?? o.quantity ?? "0",
    filledQuantity: parseFilledQuantity(o),
    priceUsd: parsePriceUsd(o),
    createdAt: o.createdAt ?? o.placedAt ?? o.orderDate ?? o.acceptedAt ?? null,
    updatedAt: o.updatedAt ?? o.completedAt ?? o.closedAt ?? null,
  };
}

function preparePrehash({ method, path, timestamp, queryParams, body }: PrehashParams): string {
  const headers = {
    "x-definitive-api-key": process.env.DEFINITIVE_API_KEY ?? "",
    "x-definitive-timestamp": timestamp,
  };

  const sortedHeaders = Object.entries(headers)
    .filter(([k]) => k.toLowerCase().startsWith("x-definitive-"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
    .join(",");

  const queryParamsString = queryParams ? new URLSearchParams(queryParams).toString() : "";
  const bodyString = body ?? "";
  return `${method}:${path}?${queryParamsString}:${timestamp}:${sortedHeaders}${bodyString}`;
}

function signRequest(prehash: string): string {
  const secret = (process.env.DEFINITIVE_API_SECRET ?? "").replace("dpks_", "");
  return createHmac("sha256", secret).update(prehash).digest("hex");
}

async function definitivePortfolioGet<T>(
  path: string,
  queryParams?: Record<string, string>
): Promise<T> {
  const timestamp = Date.now().toString();
  const prehash = preparePrehash({ method: "GET", path, timestamp, queryParams });
  const signature = signRequest(prehash);

  const qs = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const url = `${PORTFOLIO_BASE}${path}${qs}`;

  const res = await fetch(url, {
    headers: {
      "x-definitive-api-key": process.env.DEFINITIVE_API_KEY ?? "",
      "x-definitive-signature": signature,
      "x-definitive-timestamp": timestamp,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Definitive portfolio ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

async function definitiveFlashGet<T>(
  path: string,
  queryParams: Record<string, string>
): Promise<T> {
  const url = new URL(`${FLASH_BASE}${path}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "x-definitive-api-key": process.env.DEFINITIVE_API_KEY ?? "",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Definitive flash ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

async function fetchFlashOrdersPage(
  funderAddress: string,
  statuses?: string
): Promise<DefinitiveOrder[]> {
  const params: Record<string, string> = {
    funderAddress: funderAddress.toLowerCase(),
    pageSize: String(DEFINITIVE_FLASH_PAGE_SIZE),
  };
  if (statuses) params.statuses = statuses;

  const data = await definitiveFlashGet<{ orders?: RawDefinitiveOrder[] }>("/orders", params);
  const raw = data.orders ?? [];
  return raw.map(mapDefinitiveOrder).filter((o) => o.orderId.length > 0);
}

/** Flash API: list orders for the funder (up to 200 per status bucket). */
export async function fetchFlashOrders(funderAddress: string): Promise<DefinitiveOrder[]> {
  const byId = new Map<string, DefinitiveOrder>();

  const results = await Promise.allSettled(
    DEFINITIVE_FLASH_STATUSES.map((status) =>
      fetchFlashOrdersPage(funderAddress, status)
    )
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const o of result.value) byId.set(o.orderId, o);
    }
  }

  return [...byId.values()];
}

/** Portfolio API (HMAC): org-level order list. */
async function fetchPortfolioOrders(): Promise<DefinitiveOrder[]> {
  const data = await definitivePortfolioGet<{ orders?: RawDefinitiveOrder[] } | RawDefinitiveOrder[]>(
    "/v2/portfolio/orders"
  );

  const raw: RawDefinitiveOrder[] = Array.isArray(data)
    ? data
    : (data as { orders?: RawDefinitiveOrder[] }).orders ?? [];

  return raw.map(mapDefinitiveOrder).filter((o) => o.orderId.length > 0);
}

/**
 * Fetch Definitive orders for the portfolio sync.
 * Uses Flash API when only an integrator key is configured; adds Portfolio API when a secret is set.
 */
export async function fetchDefinitiveOrders(
  funderAddress: string
): Promise<DefinitiveOrder[]> {
  if (!process.env.DEFINITIVE_API_KEY?.trim()) {
    console.warn("Definitive orders skipped: DEFINITIVE_API_KEY not set");
    return [];
  }

  const byId = new Map<string, DefinitiveOrder>();

  const add = (orders: DefinitiveOrder[]) => {
    for (const o of orders) {
      if (o.orderId) byId.set(o.orderId, o);
    }
  };

  try {
    add(await fetchFlashOrders(funderAddress));
  } catch (e) {
    console.warn("Definitive Flash orders fetch failed:", (e as Error).message);
  }

  if (usePortfolioApi()) {
    try {
      add(await fetchPortfolioOrders());
    } catch (e) {
      console.warn("Definitive Portfolio orders fetch failed:", (e as Error).message);
    }
  }

  return [...byId.values()];
}
