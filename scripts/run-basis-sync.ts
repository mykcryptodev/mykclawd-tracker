// On-chain cost-basis sync for GitHub Actions (and local use).
//
// Rebuilds `lots` from our own transfer history: ingest transfers -> refresh
// prices -> replay swaps priced off their cash counter-leg. Exits non-zero on
// failure so a broken run is visible in the Actions UI rather than silently
// leaving the PnL table stale.
//
// Logs the shape of what it found on purpose: without DB access from a dev
// machine, this output is the only evidence that the basis is real.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS?.trim() ||
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

(async () => {
  try {
    const { runMigrations } = await import("../db/migrate");
    const { ingestTransfers, ingestNativeEthBackfill, synthesizeEthFromWethWithdrawals } =
      await import("../lib/ingest/transfers");
    const { enrichTokens } = await import("../lib/ingest/tokens");
    const { ingestPrices } = await import("../lib/ingest/prices");
    const { computeCostBasis } = await import("../lib/pnl/basis");
    const { db } = await import("../db/client");
    const { transfers, prices } = await import("../db/schema");

    await runMigrations();

    // One-time repair: getZerionId used to swallow 429s as "not listed", so the
    // 2026-11-20 catch-up marked hundreds of tokens zerion_checked with no id.
    // Re-queue them; the per-run Zerion budget spreads the re-check out.
    const { client } = await import("../db/client");
    const repairKey = "zerion_recheck_2026_11_20";
    const done = await client.execute({ sql: "SELECT 1 FROM sync_state WHERE key = ?", args: [repairKey] });
    if (done.rows.length === 0) {
      const res = await client.execute(
        "UPDATE tokens SET zerion_checked = 0 WHERE zerion_checked = 1 AND zerion_id IS NULL AND is_priced = 0"
      );
      await client.execute({ sql: "INSERT INTO sync_state (key, value) VALUES (?, ?)", args: [repairKey, new Date().toISOString()] });
      console.log(`Re-queued ${res.rowsAffected} tokens for a Zerion re-check`);
    }

    // Leave room for steps 2-5 inside the job's timeout-minutes.
    const budgetMinutes = Number(process.env.INGEST_BUDGET_MINUTES || 20);
    const deadline = Date.now() + budgetMinutes * 60_000;

    console.log(`1/5 Ingesting transfers (budget ${budgetMinutes} min)...`);
    const { newTransfers, blocksScanned, blocksRemaining } =
      await ingestTransfers(TRACKED_ADDRESS, deadline);
    console.log(`    ${newTransfers} new across ${blocksScanned.toLocaleString()} blocks`);
    if (blocksRemaining > 0) {
      console.warn(
        `    CATCHING UP: ${blocksRemaining.toLocaleString()} blocks still to ingest; ` +
          `PnL stays incomplete until the backlog clears`
      );
    }

    console.log("2/5 Backfilling native ETH...");
    const nativeEth = await ingestNativeEthBackfill(TRACKED_ADDRESS);
    const synthesized = await synthesizeEthFromWethWithdrawals();
    console.log(`    ${nativeEth} native, ${synthesized} synthesized from WETH withdrawals`);

    console.log("3/5 Enriching token metadata...");
    const tokensAdded = await enrichTokens();
    console.log(`    ${tokensAdded} tokens enriched`);

    console.log("4/5 Refreshing prices...");
    const pricesAdded = await ingestPrices();
    console.log(`    ${pricesAdded} price rows`);

    console.log("5/5 Computing cost basis...");
    const basis = await computeCostBasis();

    const totalTransfers = (await db.select().from(transfers).all()).length;
    const priceRows = (await db.select().from(prices).all()).length;

    console.log(
      "\nCost basis sync OK:",
      JSON.stringify(
        {
          ...basis,
          totalTransfersInDb: totalTransfers,
          totalPriceRowsInDb: priceRows,
        },
        null,
        2
      )
    );

    // An empty transfer history means the basis is vacuous — the PnL column
    // would render as "no basis" for everything. Fail loudly instead.
    if (totalTransfers === 0) {
      console.error(
        "\nFAILED: transfers table is empty, so no cost basis could be computed."
      );
      process.exit(1);
    }

    if (basis.incompleteTokens.length > 0) {
      console.warn(
        `\nWARNING: ${basis.incompleteTokens.length} token(s) have incomplete history ` +
          `and will show no PnL: ${basis.incompleteTokens.join(", ")}`
      );
    }

    process.exit(0);
  } catch (e) {
    console.error("Cost basis sync FAILED:", e);
    process.exit(1);
  }
})();
