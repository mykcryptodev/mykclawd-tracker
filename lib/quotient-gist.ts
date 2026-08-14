// Public gist that holds the Quotient Mirror strategy snapshot.
// Written by scripts/sync-quotient.ts on the host (every 15 min via cron).
// Read by app/api/quotient/route.ts. Not secret.
export const QUOTIENT_GIST_ID = "308d138cff824829e8b4c6ebc25f94fc";
export const QUOTIENT_GIST_RAW_URL = `https://gist.githubusercontent.com/mykclawd/${QUOTIENT_GIST_ID}/raw/quotient-mirror.json`;
