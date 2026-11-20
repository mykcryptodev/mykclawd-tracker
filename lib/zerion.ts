const ZERION_BASE = "https://api.zerion.io/v1";
const AUTH = "Basic " + Buffer.from(`${process.env.ZERION_API_KEY ?? ""}:`).toString("base64");

// The Zerion key is on the demo tier: 300 requests/day for the whole org,
// shared with the portfolio sync (~10 calls/run) and the site. The cost basis
// job used to spend 400+ per run here, which starved the portfolio sync. Cap it
// per process and let the remaining tokens wait for the next run.
let callsRemaining = Number(process.env.ZERION_BASIS_CALLS_PER_RUN || 30);

// Thrown when the per-run budget is spent or Zerion returns 429. Callers stop
// their pass on it instead of recording the token as "not on Zerion".
export class ZerionQuotaError extends Error {}

async function zerionFetch(path: string): Promise<unknown> {
  if (callsRemaining <= 0) throw new ZerionQuotaError("Zerion per-run budget spent");
  callsRemaining--;
  const res = await fetch(`${ZERION_BASE}${path}`, {
    headers: { Authorization: AUTH },
  });
  if (res.status === 429) {
    callsRemaining = 0;
    throw new ZerionQuotaError(`Zerion ${path} → 429`);
  }
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
  } catch (e) {
    if (e instanceof ZerionQuotaError) throw e;
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
  } catch (e) {
    if (e instanceof ZerionQuotaError) throw e;
    return [];
  }
}
