import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { runSync } from "../lib/sync";

(async () => {
  try {
    const result = await runSync();
    console.log("\nSync result:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("Sync failed:", e);
    process.exit(1);
  }
})();
