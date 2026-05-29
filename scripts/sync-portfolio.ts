import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

(async () => {
  try {
    const { syncPortfolioNav } = await import("../lib/portfolio/sync");
    const result = await syncPortfolioNav();
    console.log("\nPortfolio NAV sync:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("Portfolio NAV sync failed:", e);
    process.exit(1);
  }
})();
