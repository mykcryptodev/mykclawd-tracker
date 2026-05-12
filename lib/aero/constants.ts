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
