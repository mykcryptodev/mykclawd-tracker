import { describe, it, expect } from "vitest";
import {
  ticksToDailyNav,
  excludeNativeEth,
  NATIVE_ETH_ADDRESS,
  type ZapperToken,
} from "./zapper";
import {
  daysAgoUtc,
  navAtOrBefore,
  deltaOverDays,
  computeDeltas,
  type NavPoint,
} from "./read";

describe("ticksToDailyNav", () => {
  it("collapses to one ascending value per UTC day (last tick of day wins)", () => {
    const d1 = Date.UTC(2026, 0, 18, 9, 0); // 2026-01-18 09:00Z
    const d1b = Date.UTC(2026, 0, 18, 21, 0); // 2026-01-18 21:00Z (later same day)
    const d2 = Date.UTC(2026, 0, 19, 0, 0); // 2026-01-19

    const out = ticksToDailyNav([
      { timestamp: d2, value: 200 },
      { timestamp: d1, value: 100 },
      { timestamp: d1b, value: 150 },
    ]);

    expect(out).toEqual([
      { date: "2026-01-18", valueUsd: 150 },
      { date: "2026-01-19", valueUsd: 200 },
    ]);
  });

  it("returns [] for no ticks", () => {
    expect(ticksToDailyNav([])).toEqual([]);
  });
});

describe("excludeNativeEth", () => {
  const mk = (tokenAddress: string, balanceUsd: number, balance = 1): ZapperToken => ({
    tokenAddress,
    symbol: "X",
    name: "X",
    network: "Base",
    imgUrl: null,
    price: balanceUsd / balance,
    balance,
    balanceRaw: "0",
    balanceUsd,
  });

  it("removes native ETH from the list and subtracts it from the total", () => {
    const tokens = [
      mk("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 3443), // USDC
      mk(NATIVE_ETH_ADDRESS, 1547, 0.77), // native ETH
      mk("0x4200000000000000000000000000000000000006", 1511), // WETH
    ];
    const out = excludeNativeEth(7684, tokens);

    expect(out.totalUsd).toBe(7684 - 1547);
    expect(out.tokens.map((t) => t.tokenAddress)).not.toContain(NATIVE_ETH_ADDRESS);
    expect(out.tokens).toHaveLength(2);
    expect(out.nativeEth).toEqual({ balance: 0.77, balanceUsd: 1547, price: 1547 / 0.77 });
  });

  it("leaves total/list untouched and nativeEth null when there is no native ETH", () => {
    const tokens = [mk("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 3443)];
    const out = excludeNativeEth(3443, tokens);

    expect(out.totalUsd).toBe(3443);
    expect(out.tokens).toHaveLength(1);
    expect(out.nativeEth).toBeNull();
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
