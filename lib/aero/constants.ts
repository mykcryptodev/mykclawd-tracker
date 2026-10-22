// Aerodrome (Base) constants used by the LP monitor.

export const AERO_WETH  = "0x4200000000000000000000000000000000000006";
export const AERO_CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
export const AERO_AERO  = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
// Aerodrome Slipstream NonfungiblePositionManager — constant on Base
export const AERO_NPM   = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";

// Known counterparties — addresses we should NOT treat as "external capital" when
// reconstructing the HODL baseline (these are part of the strategy itself).
export const AERO_KNOWN_ROUTERS: Record<string, string> = {
  "0xcaf22ce31298cf2bf1d152862f80216478ad7c67": "Aerodrome UniversalRouter",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Protocol Settlement",
};

// CoinGecko id mapping for the tokens we care about. cbBTC tracks BTC so we use that.
export const AERO_COINGECKO_IDS: Record<string, string> = {
  [AERO_WETH]:  "ethereum",
  [AERO_CBBTC]: "bitcoin",
  [AERO_AERO]:  "aerodrome-finance",
};

// Default monitored address — overridable via env or config table.
export const AERO_DEFAULT_ADDRESS = "0xf142022273602c6a6c0ea7a044d21082273bd686";

// Rebalancer Safes shown on /aero.
export const TRACKED_ADDRESSES = [
  { address: "0xf142022273602c6a6c0ea7a044d21082273bd686", label: "mykclawd" },
  { address: "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7", label: "wishlist.holiday" },
  { address: "0x4d63da43f74e864f069f908465f2f3f13977976e", label: "yield.myk.eth" },
] as const;

// Strategies that have been wound down. Snapshots after `endedTs` are ignored and the
// sync no longer writes new ones, so the dashboard stays frozen at the last pre-exit state.
// 2026-10-22: Aerodrome + Velodrome merged into Aero; every legacy gauge was killed at the
// final epoch flip, so the rebalancers were unstaked, withdrawn and their modules disabled.
export interface AeroEndedStrategy {
  endedTs: number;
  reason: string;
  txs: { label: string; hash: string }[];
}

export const AERO_ENDED: Record<string, AeroEndedStrategy> = {
  "0xf142022273602c6a6c0ea7a044d21082273bd686": {
    endedTs: 1792672200,
    reason: "Aerodrome → Aero migration",
    txs: [
      { label: "Unstake from killed gauge", hash: "0x3234158e12860df9a47da98ff60ab810d4b5a0c309e99d71792791623abeb779" },
      { label: "Withdraw LP + upgrade AERO", hash: "0x4292ba7191f9a48fafe6abb523f18a67ceedd71edab584cd2b8ec6aadca391cd" },
      { label: "Sell AERO via CoW (profit taken)", hash: "0x659dab21e131ec2855e7ee50a4d1fee29880e4fc673f03c7f6af15030f29033a" },
    ],
  },
  "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7": {
    endedTs: 1792672200,
    reason: "Aerodrome → Aero migration",
    txs: [
      { label: "Unstake from killed gauge", hash: "0x8427931db87a162fb9f945feccbd8fc8d2e73677a7f86ea35149abc0eec012b6" },
      { label: "Withdraw LP + upgrade AERO", hash: "0xe7d387dd6bf57871d384a3dd3d15c66682d61958d97266eae07d537e9923128c" },
      { label: "Sell AERO via CoW (profit taken)", hash: "0x3776acece0f09cb25e8e30799c2f020fe3d273fe7878ea634130c55bc8a5737d" },
    ],
  },
  "0x4d63da43f74e864f069f908465f2f3f13977976e": {
    endedTs: 1792672200,
    reason: "Aerodrome → Aero migration",
    txs: [
      { label: "Unstake from killed gauge", hash: "0xfd6837948b73e77b5c5a24b964099f6bc85af8619daa6d8c982fd2daaef97668" },
      { label: "Withdraw LP + upgrade AERO", hash: "0xeeda42470702da55b5e921dbeefe7f73cbf690ec9e2b4a04fffc8cb6739f6aa8" },
      { label: "Sell AERO via CoW (profit taken)", hash: "0x6fdaf00ddd1db2cd8ac3a8dfcd93d860381da03de003ad7dec7d7a446e17e8f0" },
    ],
  },
};

/** Upper bound for snapshot timestamps shown for an address (frozen strategies only). */
export function aeroSnapshotCutoff(address: string): number {
  return AERO_ENDED[address.toLowerCase()]?.endedTs ?? Number.MAX_SAFE_INTEGER;
}

export interface TokenMeta {
  addr: string;
  sym: string;
  dec: number;
}

export const AERO_SYMBOLS: Record<string, TokenMeta> = {
  [AERO_WETH]:  { addr: AERO_WETH,  sym: "WETH",  dec: 18 },
  [AERO_CBBTC]: { addr: AERO_CBBTC, sym: "cbBTC", dec: 8  },
  [AERO_AERO]:  { addr: AERO_AERO,  sym: "AERO",  dec: 18 },
};
