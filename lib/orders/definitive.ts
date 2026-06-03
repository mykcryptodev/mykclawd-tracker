/**
 * Definitive.fi order fetcher.
 *
 * Auth: HMAC-SHA256 signed requests.
 * Endpoint: GET /v2/portfolio/orders
 * Docs: https://ddp.definitive.fi/api/getting-started
 *
 * Requires env vars: DEFINITIVE_API_KEY, DEFINITIVE_API_SECRET
 */

import { createHmac } from "crypto";

const DEFINITIVE_BASE = "https://ddp.definitive.fi";

export interface DefinitiveOrder {
  source: "definitive";
  orderId: string;
  status: string; // "open" | "filled" | "cancelled" | "partial" | "pending" etc
  type: string;   // "market" | "limit" | "twap" | "stop"
  side: "buy" | "sell";
  chain: string;
  targetAsset: string;   // token address being bought/sold
  targetSymbol: string | null;
  contraAsset: string;   // the other side of the trade
  contraSymbol: string | null;
  quantity: string;
  filledQuantity: string | null;
  priceUsd: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface PrehashParams {
  method: "GET" | "POST" | "DELETE";
  path: string;
  timestamp: string;
  queryParams?: Record<string, string>;
  body?: string;
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

async function definitiveGet<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
  const timestamp = Date.now().toString();
  const prehash = preparePrehash({ method: "GET", path, timestamp, queryParams });
  const signature = signRequest(prehash);

  const qs = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const url = `${DEFINITIVE_BASE}${path}${qs}`;

  const res = await fetch(url, {
    headers: {
      "x-definitive-api-key": process.env.DEFINITIVE_API_KEY ?? "",
      "x-definitive-signature": signature,
      "x-definitive-timestamp": timestamp,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Definitive ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

interface RawDefinitiveOrder {
  id?: string;
  orderId?: string;
  status?: string;
  type?: string;
  orderType?: string;
  side?: string;
  orderSide?: string;
  chain?: string;
  targetAsset?: string;
  targetSymbol?: string;
  contraAsset?: string;
  contraSymbol?: string;
  qty?: string;
  quantity?: string;
  filledQty?: string;
  filledQuantity?: string;
  price?: number;
  priceUsd?: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export async function fetchDefinitiveOrders(): Promise<DefinitiveOrder[]> {
  if (!process.env.DEFINITIVE_API_KEY || !process.env.DEFINITIVE_API_SECRET) return [];

  try {
    const data = await definitiveGet<{ orders?: RawDefinitiveOrder[] } | RawDefinitiveOrder[]>(
      "/v2/portfolio/orders"
    );

    const raw: RawDefinitiveOrder[] = Array.isArray(data)
      ? data
      : (data as { orders?: RawDefinitiveOrder[] }).orders ?? [];

    return raw.map((o) => ({
      source: "definitive" as const,
      orderId: o.id ?? o.orderId ?? "",
      status: o.status ?? "unknown",
      type: o.type ?? o.orderType ?? "market",
      side: ((o.side ?? o.orderSide ?? "").toLowerCase() === "sell" ? "sell" : "buy") as "buy" | "sell",
      chain: o.chain ?? "base",
      targetAsset: (o.targetAsset ?? "").toLowerCase(),
      targetSymbol: o.targetSymbol ?? null,
      contraAsset: (o.contraAsset ?? "").toLowerCase(),
      contraSymbol: o.contraSymbol ?? null,
      quantity: o.qty ?? o.quantity ?? "0",
      filledQuantity: o.filledQty ?? o.filledQuantity ?? null,
      priceUsd: o.price ?? o.priceUsd ?? null,
      createdAt: o.createdAt ?? null,
      updatedAt: o.updatedAt ?? o.completedAt ?? null,
    }));
  } catch (e) {
    console.warn("Definitive orders fetch failed:", (e as Error).message);
    return [];
  }
}
