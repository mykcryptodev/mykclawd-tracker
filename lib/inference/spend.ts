// Surplus Intelligence spend since the prepaid-deposit switch. Per-request spend no longer
// settles on-chain from our wallet, so a host job (workspace-dev/scripts/surplus_spend_sync.py)
// aggregates the Surplus request log hourly and publishes it as JSON on the reports server.

export const SPEND_URL = "https://reports.mykclawd.xyz/inference/spend.json";

export interface SpendRow {
  name: string;
  usd: number;
  requests: number;
}

export interface SurplusSpend {
  generated_at: string;
  coverage_start: string | null;
  latest_request_at: string | null;
  total_usd: number;
  total_requests: number;
  charged_requests: number;
  daily: { day: string; usd: number; requests: number }[];
  by_provider: SpendRow[];
  by_model: SpendRow[];
}

export async function getSurplusSpend(): Promise<SurplusSpend | null> {
  try {
    const res = await fetch(SPEND_URL, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    return (await res.json()) as SurplusSpend;
  } catch {
    return null;
  }
}

// Per-app usage, split by Surplus API key (wishlist.holiday, the Clawd host, ...).
// Published by the same host job as spend.json.
export const APPS_URL = "https://reports.mykclawd.xyz/inference/apps.json";

export interface AppSpend {
  name: string;
  since: string | null;
  total_usd: number;
  total_requests: number;
  charged_requests: number;
  last_request_at: string | null;
  daily: { day: string; usd: number; requests: number }[];
}

export interface SurplusApps {
  generated_at: string;
  coverage_start: string | null;
  latest_request_at: string | null;
  apps: AppSpend[];
}

export async function getSurplusApps(): Promise<SurplusApps | null> {
  try {
    const res = await fetch(APPS_URL, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    return (await res.json()) as SurplusApps;
  } catch {
    return null;
  }
}
