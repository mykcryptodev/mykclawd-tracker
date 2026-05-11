const ZERION_BASE = "https://api.zerion.io/v1";
const AUTH = "Basic " + Buffer.from(`${process.env.ZERION_API_KEY ?? ""}:`).toString("base64");

async function zerionFetch(path: string): Promise<unknown> {
  const res = await fetch(`${ZERION_BASE}${path}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`Zerion ${path} → ${res.status}`);
  return res.json();
}

// Look up a Zerion fungible UUID by Base contract address. Returns null if not listed.
export async function getZerionId(contractAddress: string): Promise<string | null> {
  try {
    const addr = contractAddress.toLowerCase();
    const data = (await zerionFetch(
      `/fungibles/?filter%5Bimplementation_address%5D=${addr}&filter%5Bimplementation_chain_id%5D=base&currency=usd`
    )) as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// Fetch year of daily close prices for a Zerion fungible UUID.
// Returns array of [unixTimestampSeconds, priceUsd].
export async function getZerionPriceHistory(zerionId: string): Promise<Array<[number, number]>> {
  try {
    const data = (await zerionFetch(
      `/fungibles/${zerionId}/charts/year?currency=usd`
    )) as { data?: { attributes?: { points?: Array<[number, number]> } } };
    return data.data?.attributes?.points ?? [];
  } catch {
    return [];
  }
}
