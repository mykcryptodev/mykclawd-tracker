// Direct portfolio sync runner for GitHub Actions (and local use).
// Unlike the /api/portfolio/sync endpoint — which returns 200 before the
// background work runs and therefore can't fail the workflow — this exits
// non-zero on any error so a broken sync is visible in the Actions UI.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

(async () => {
  try {
    const { syncPortfolioNav } = await import("../lib/portfolio/sync");
    const result = await syncPortfolioNav();
    console.log("Portfolio sync OK:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("Portfolio sync FAILED:", e);
    process.exit(1);
  }
})();
