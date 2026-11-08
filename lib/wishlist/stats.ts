// wishlist.holiday product stats. A host job (workspace-dev/scripts/wishlist_stats_sync.cjs)
// combines the wishlist database (totals) with PostHog (activity) hourly and publishes
// aggregates only as JSON on the reports server.

export const WISHLIST_STATS_URL = "https://reports.mykclawd.xyz/wishlist/stats.json";

export interface WishlistDay {
  day: string;
  active: number;
  visitors: number;
  signups: number;
  items: number;
  link_items: number;
  exchanges_created: number;
  exchange_joins: number;
  gifts_claimed: number;
}

export interface WishlistStats {
  generated_at: string;
  tracking_since: string;
  totals: {
    users: number;
    activated_users: number;
    lists: number;
    kid_lists: number;
    items: number;
    link_items: number;
    items_with_photo: number;
    exchanges: number;
    exchanges_drawn: number;
    exchange_members: number;
    gifts_claimed: number;
  };
  active: { dau: number; wau: number; mau: number; visitors_7d: number };
  daily: WishlistDay[];
  wau_series: { day: string; wau: number }[] | null;
  items_by_platform: { name: string; items: number }[];
  devices_30d: { name: string; users: number }[];
  events: {
    items_added: number;
    kid_items_added: number;
    signups: number;
    exchanges_created: number;
    exchange_joins: number;
    names_drawn: number;
    gifts_claimed: number;
    notes: number;
    push_enabled: number;
  };
}

export async function getWishlistStats(): Promise<WishlistStats | null> {
  try {
    const res = await fetch(WISHLIST_STATS_URL, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    return (await res.json()) as WishlistStats;
  } catch {
    return null;
  }
}
