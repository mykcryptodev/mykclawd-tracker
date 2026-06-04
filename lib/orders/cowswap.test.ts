import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COW_ORDERS_PAGE_SIZE, fetchCowswapOrders, type CowOrder } from "./cowswap";

const ADDR = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function mockOrder(i: number): CowOrder {
  return {
    uid: `0x${i.toString(16).padStart(64, "0")}`,
    status: "fulfilled",
    kind: "sell",
    class: "limit",
    sellToken: "0x4200000000000000000000000000000000000006",
    buyToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    sellAmount: "1",
    buyAmount: "1",
    executedSellAmount: "1",
    executedBuyAmount: "1",
    executedFee: "0",
    feeAmount: "0",
    validTo: 0,
    creationDate: "2026-06-01T00:00:00Z",
    partiallyFillable: false,
    invalidated: false,
  };
}

describe("fetchCowswapOrders", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("paginates until a short page", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => mockOrder(i))), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(Array.from({ length: 25 }, (_, i) => mockOrder(100 + i))), {
          status: 200,
        })
      );

    const orders = await fetchCowswapOrders(ADDR, { pageSize: 100 });

    expect(orders).toHaveLength(125);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(`offset=0&limit=100`);
    expect(fetchMock.mock.calls[1][0]).toContain(`offset=100&limit=100`);
    expect(fetchMock.mock.calls[0][0]).toContain(ADDR.toLowerCase());
  });

  it("stops at maxOrders safety cap", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const offset = Number(new URL(url).searchParams.get("offset"));
      const limit = Number(new URL(url).searchParams.get("limit"));
      const batch = Array.from({ length: limit }, (_, i) => mockOrder(offset + i));
      return new Response(JSON.stringify(batch), { status: 200 });
    });

    const orders = await fetchCowswapOrders(ADDR, { pageSize: 100, maxOrders: 250 });

    expect(orders).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses API-max page size by default", () => {
    expect(COW_ORDERS_PAGE_SIZE).toBe(1000);
  });
});
