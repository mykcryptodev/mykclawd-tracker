import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pointsToDailyNav,
  fetchZerionTokenPnl,
} from "./zerion";
import {
  daysAgoUtc,
  navAtOrBefore,
  deltaOverDays,
  computeDeltas,
  tokenKeysForOrder,
  type NavPoint,
} from "./read";
import {
  fmtRawTokenAmount,
  getTokenDecimals,
  isActivePortfolioOrder,
  filterPortfolioOrders,
} from "./orders";
import type { PortfolioOrder } from "./read";

describe("zerion request throttling", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ZERION_API_KEY;

  beforeEach(() => {
    process.env.ZERION_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ZERION_API_KEY = originalKey;
  });

  it("serializes concurrent calls at least ~1.1s apart instead of racing", async () => {
    const callTimes: number[] = [];
    global.fetch = vi.fn(async () => {
      callTimes.push(Date.now());
      return new Response(
        JSON.stringify({
          data: {
            type: "wallet_pnl",
            id: "x",
            attributes: {
              total_gain: 1,
              realized_gain: 0,
              unrealized_gain: 1,
              relative_total_gain_percentage: 1,
              relative_realized_gain_percentage: 0,
              relative_unrealized_gain_percentage: 1,
              total_invested: 1,
              net_invested: 1,
              realized_cost_basis: 0,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await Promise.all([
      fetchZerionTokenPnl("0xwallet", "0xtoken1"),
      fetchZerionTokenPnl("0xwallet", "0xtoken2"),
      fetchZerionTokenPnl("0xwallet", "0xtoken3"),
    ]);

    expect(callTimes).toHaveLength(3);
    for (let i = 1; i < callTimes.length; i++) {
      expect(callTimes[i] - callTimes[i - 1]).toBeGreaterThanOrEqual(1000);
    }
  }, 10000);

  it("retries once after a 429 instead of treating it as no data", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ errors: [{ title: "Too many requests" }] }), {
          status: 429,
          headers: { "ratelimit-reset": "1" },
        });
      }
      return new Response(
        JSON.stringify({
          data: {
            type: "wallet_pnl",
            id: "x",
            attributes: {
              total_gain: 5,
              realized_gain: 0,
              unrealized_gain: 5,
              relative_total_gain_percentage: 5,
              relative_realized_gain_percentage: 0,
              relative_unrealized_gain_percentage: 5,
              total_invested: 10,
              net_invested: 10,
              realized_cost_basis: 0,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const pnl = await fetchZerionTokenPnl("0xwallet", "0xtoken");
    expect(calls).toBe(2);
    expect(pnl?.totalGain).toBe(5);
  }, 10000);
});

describe("pointsToDailyNav", () => {
  it("collapses to one ascending value per UTC day (last tick of day wins)", () => {
    const d1 = Date.UTC(2026, 0, 18, 9, 0) / 1000; // 2026-01-18 09:00Z
    const d1b = Date.UTC(2026, 0, 18, 21, 0) / 1000; // 2026-01-18 21:00Z (later same day)
    const d2 = Date.UTC(2026, 0, 19, 0, 0) / 1000; // 2026-01-19

    const out = pointsToDailyNav([
      [d2, 200],
      [d1, 100],
      [d1b, 150],
    ]);

    expect(out).toEqual([
      { date: "2026-01-18", valueUsd: 150 },
      { date: "2026-01-19", valueUsd: 200 },
    ]);
  });

  it("returns [] for no ticks", () => {
    expect(pointsToDailyNav([])).toEqual([]);
  });
});

describe("daysAgoUtc", () => {
  const from = new Date("2026-05-29T12:00:00Z");
  it("subtracts whole days in UTC across month boundaries", () => {
    expect(daysAgoUtc(0, from)).toBe("2026-05-29");
    expect(daysAgoUtc(1, from)).toBe("2026-05-28");
    expect(daysAgoUtc(7, from)).toBe("2026-05-22");
    expect(daysAgoUtc(30, from)).toBe("2026-04-29");
  });
});

describe("navAtOrBefore", () => {
  const series: NavPoint[] = [
    { date: "2026-04-29", valueUsd: 1000 },
    { date: "2026-05-22", valueUsd: 6000 },
    { date: "2026-05-28", valueUsd: 7000 },
  ];

  it("returns the most recent point on or before the target", () => {
    expect(navAtOrBefore(series, "2026-05-25")?.valueUsd).toBe(6000);
    expect(navAtOrBefore(series, "2026-05-28")?.valueUsd).toBe(7000); // exact match
    expect(navAtOrBefore(series, "2026-06-01")?.valueUsd).toBe(7000); // after last
  });

  it("returns null when every point is newer than the target", () => {
    expect(navAtOrBefore(series, "2026-01-01")).toBeNull();
  });
});


describe("tokenKeysForOrder", () => {
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const WETH = "0x4200000000000000000000000000000000000006";
  const MEME = "0xbf8e8f0e8866a7052f948c16508644347c57aba3";
  const OTHER = "0x8ebf0ee27898454216f564a2e67f6907fe3b7ba3";

  it("groups WETH/USDC-funded buys under the non-quote token", () => {
    expect(tokenKeysForOrder({ sellToken: WETH, buyToken: MEME, tokenAddress: null })).toEqual([MEME]);
    expect(tokenKeysForOrder({ sellToken: USDC, buyToken: MEME, tokenAddress: null })).toEqual([MEME]);
  });

  it("groups token-to-USDC sells under the sold token", () => {
    expect(tokenKeysForOrder({ sellToken: MEME, buyToken: USDC, tokenAddress: null })).toEqual([MEME]);
  });

  it("uses explicit provider tokenAddress when available", () => {
    expect(tokenKeysForOrder({ sellToken: USDC, buyToken: WETH, tokenAddress: MEME })).toEqual([MEME]);
  });

  it("keeps both non-quote legs for token-to-token orders", () => {
    expect(tokenKeysForOrder({ sellToken: MEME, buyToken: OTHER, tokenAddress: null })).toEqual([MEME, OTHER]);
  });
});

describe("portfolio order helpers", () => {
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

  it("treats only CoW open orders as active", () => {
    expect(isActivePortfolioOrder({ source: "cowswap", status: "open" })).toBe(true);
    expect(isActivePortfolioOrder({ source: "cowswap", status: "presign" })).toBe(false);
    expect(isActivePortfolioOrder({ source: "cowswap", status: "pending" })).toBe(false);
    expect(isActivePortfolioOrder({ source: "cowswap", status: "filled" })).toBe(false);
  });

  it("filters orders unless showAll", () => {
    const orders = [
      { source: "cowswap", status: "open" },
      { source: "cowswap", status: "filled" },
    ] as PortfolioOrder[];
    expect(filterPortfolioOrders(orders, false)).toHaveLength(1);
    expect(filterPortfolioOrders(orders, true)).toHaveLength(2);
  });

  it("formats USDC amounts with 6 decimals", () => {
    expect(getTokenDecimals(USDC)).toBe(6);
    expect(fmtRawTokenAmount("29551511", 6)).toBe("29.5515");
  });
});

describe("delta math", () => {
  const from = new Date("2026-05-29T12:00:00Z");
  const series: NavPoint[] = [
    { date: "2026-04-29", valueUsd: 1000 },
    { date: "2026-05-22", valueUsd: 6000 },
    { date: "2026-05-28", valueUsd: 7000 },
    { date: "2026-05-29", valueUsd: 7700 },
  ];

  it("computes absolute + percent change vs the baseline N days ago", () => {
    const d1 = deltaOverDays(series, 7700, 1, from);
    expect(d1).toEqual({ abs: 700, pct: 10 });

    const d7 = deltaOverDays(series, 7700, 7, from);
    expect(d7?.abs).toBe(1700);
    expect(d7?.pct).toBeCloseTo(28.333, 2);
  });

  it("returns null when there is no usable baseline", () => {
    // 30d baseline (2026-04-29 = 1000) exists here
    expect(computeDeltas(series, 7700, from).d30).toEqual({ abs: 6700, pct: 670 });
    // but a series with no point old enough yields null
    const shortSeries: NavPoint[] = [{ date: "2026-05-29", valueUsd: 7700 }];
    const deltas = computeDeltas(shortSeries, 7700, from);
    expect(deltas.d1).toBeNull();
    expect(deltas.d30).toBeNull();
  });

  it("returns null when the baseline value is zero (avoids divide-by-zero)", () => {
    const zeroBase: NavPoint[] = [
      { date: "2026-05-28", valueUsd: 0 },
      { date: "2026-05-29", valueUsd: 7700 },
    ];
    expect(deltaOverDays(zeroBase, 7700, 1, from)).toBeNull();
  });
});
