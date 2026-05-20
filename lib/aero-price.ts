// Fetches AERO/USDC daily OHLCV from GeckoTerminal (no API key needed)
// Returns array of { ts, close } for the last N days

export interface AeroPricePoint {
  ts: number;   // unix seconds (start of day)
  open: number;
  high: number;
  low: number;
  close: number;
}

const AERO_USDC_POOL = "0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d";
const GECKO_URL = `https://api.geckoterminal.com/api/v2/networks/base/pools/${AERO_USDC_POOL}/ohlcv/day?limit=60&token=base`;

export async function fetchAeroPriceHistory(): Promise<AeroPricePoint[]> {
  try {
    const res = await fetch(GECKO_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 }, // cache 1h
    });
    if (!res.ok) return [];
    const json = await res.json() as {
      data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } };
    };
    // ohlcv_list: [timestamp, open, high, low, close, volume] — newest first
    return json.data.attributes.ohlcv_list
      .slice()
      .reverse() // oldest first
      .map(([ts, open, high, low, close]) => ({ ts, open, high, low, close }));
  } catch {
    return [];
  }
}
