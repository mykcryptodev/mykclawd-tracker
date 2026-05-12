// Shared types for aero dashboard components.

export interface AeroPosition {
  tokenId: string;
  tickLower: number;
  tickUpper: number;
  curTick: number;
  liquidity: string;
  a0: string;
  a1: string;
  earned: string;
}

export interface AeroInflow {
  ts: number;
  sym: string;
  amount: number;
  from: string;
  tx: string;
}

export interface AeroLatest {
  ts: number;
  address: string;
  pool: string;
  gauge: string;
  sym0: string;
  sym1: string;
  dec0: number;
  dec1: number;
  firstTs: number;
  lastTs: number;
  days: number;
  prices: { p0Now: number; p1Now: number; paNow: number; p0Start: number; p1Start: number; paStart: number };
  start: { eth: number; t0: number; t1: number; aero: number };
  inflows: { t0: number; t1: number; list: AeroInflow[] };
  end: { walletEth: number; walletT0: number; walletT1: number; walletAero: number; positionT0: number; positionT1: number; pendingAero: number };
  usd: {
    startUsd: number; hodlUsd: number; stratUsd: number;
    deltaUsd: number; lpOnlyDelta: number; aeroAddedUsd: number;
    deltaPct: number; apr: number;
    totalGasEth: number; totalGasUsd: number;
  };
  txCount: number;
  gasTxsCounted: number;
  positions: AeroPosition[];
}

export interface AeroHistoryPoint {
  ts: number;
  stratUsd: number;
  hodlUsd: number;
  deltaUsd: number;
  aero: number;
}

export interface AeroPayload {
  latest: AeroLatest | null;
  history: AeroHistoryPoint[];
}
