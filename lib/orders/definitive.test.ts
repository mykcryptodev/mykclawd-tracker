import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFINITIVE_FLASH_STATUSES,
  fetchFlashOrders,
  mapDefinitiveOrder,
  normalizeDefinitiveStatus,
  parseDefinitiveAssetAddress,
  parseDefinitiveSide,
} from "./definitive";

describe("definitive order parsing", () => {
  it("parses asset objects and ORDER_SIDE_* fields", () => {
    const order = mapDefinitiveOrder({
      orderId: "abc-123",
      status: "ORDER_STATUS_PARTIALLY_FILLED",
      type: "ORDER_TYPE_LIMIT",
      orderSide: "ORDER_SIDE_SELL",
      targetAsset: {
        address: "0xBf8e8F0e8866a7052f948c16508644347c57aba3",
        ticker: "WAKE",
      },
      contraAsset: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ticker: "USDC",
      },
      qty: "1000",
      filledQty: "250",
      placedAt: "2026-06-01T00:00:00Z",
    });

    expect(order.side).toBe("sell");
    expect(order.status).toBe("partial");
    expect(order.type).toBe("limit");
    expect(order.targetAsset).toBe("0xbf8e8f0e8866a7052f948c16508644347c57aba3");
    expect(order.targetSymbol).toBe("WAKE");
    expect(order.contraAsset).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  });

  it("normalizes filled status", () => {
    expect(normalizeDefinitiveStatus("ORDER_STATUS_FILLED")).toBe("filled");
    expect(normalizeDefinitiveStatus("ORDER_STATUS_ACCEPTED")).toBe("open");
    expect(parseDefinitiveSide("ORDER_SIDE_BUY")).toBe("buy");
    expect(parseDefinitiveSide("buy")).toBe("buy");
  });

  it("parses Flash API order shape", () => {
    const order = mapDefinitiveOrder({
      orderId: "flash-1",
      orderType: "limit",
      side: "sell",
      status: "ORDER_STATUS_ACCEPTED",
      targetAsset: {
        address: "0xbf8e8f0e8866a7052f948c16508644347c57aba3",
        ticker: "WAKE",
        chain: { id: "8453", name: "Base" },
      },
      contraAsset: {
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        ticker: "USDC",
        chain: { id: "8453", name: "Base" },
      },
      qty: "5000",
      filled: { targetAmount: "0", contraAmount: "0" },
      limitNotionalPrice: "0.05",
      placedAt: "2026-06-04T10:00:00Z",
    });

    expect(order.status).toBe("open");
    expect(order.type).toBe("limit");
    expect(order.targetSymbol).toBe("WAKE");
    expect(order.priceUsd).toBe(0.05);
  });

  it("returns empty for non-hex asset ids", () => {
    expect(parseDefinitiveAssetAddress({ address: "1000003", ticker: "HYPE" })).toBe("");
  });
});

describe("fetchFlashOrders", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("queries each status separately and dedupes", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const status = url.searchParams.get("statuses");
      const id = status?.includes("FILLED") ? "filled-1" : "open-1";
      return new Response(JSON.stringify({ orders: [{ orderId: id, orderType: "limit", side: "buy", status, targetAsset: { address: "0x4200000000000000000000000000000000000006", ticker: "WETH", chain: { id: "8453" } }, contraAsset: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", ticker: "USDC", chain: { id: "8453" } }, qty: "1", filled: null, limitNotionalPrice: null, placedAt: "2026-01-01T00:00:00Z", closeReason: null, funderAddress: "0xabc", maxPriceImpact: null, twapBucketCount: null, acceptedAt: null, closedAt: null, trigger: null, brackets: null }] }), { status: 200 });
    });

    const orders = await fetchFlashOrders("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01");

    expect(fetchMock).toHaveBeenCalledTimes(DEFINITIVE_FLASH_STATUSES.length);
    expect(orders).toHaveLength(2);
  });
});
