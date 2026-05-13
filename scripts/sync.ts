import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

(async () => {
  try {
    const { runSync } = await import("../lib/sync");
    const mode = process.argv.includes("--fast") ? "fast" : "full";
    const result = await runSync({ mode });
    console.log("\nSync result:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("Sync failed:", e);
    process.exit(1);
  }
})();
