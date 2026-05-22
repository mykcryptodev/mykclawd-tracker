// One-time backfill: clears the incremental-sync checkpoint for each address
// so the next run fetches the full 365-day history instead of just the recent tail.
// Run via GitHub Actions (uses production secrets) or locally with the correct env.
import "dotenv/config";
import { runMigrations } from "../db/migrate";
import { ingestAeroMonitor, setMonitoredAddress, clearLastSyncedBlock } from "../lib/aero";

const ADDRESSES = [
  { address: "0xf142022273602c6a6c0ea7a044d21082273bd686", label: "mykclawd" },
  { address: "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7", label: "wishlist.holiday" },
  { address: "0x4d63da43f74e864f069f908465f2f3f13977976e", label: "yield.myk.eth" },
];

const DAYS_BACK = 365;

async function main() {
  await runMigrations();
  for (const { address, label } of ADDRESSES) {
    console.log(`\n=== Backfilling ${label} (${address}) ===`);
    await clearLastSyncedBlock(address);
    console.log(`  Cleared lastSyncedBlock — cold-starting from ${DAYS_BACK} days back`);
    await setMonitoredAddress(address);
    const r = await ingestAeroMonitor(DAYS_BACK);
    console.log("  Position:", r.position ? `${r.position.tokenMeta0.sym}/${r.position.tokenMeta1.sym}` : "none");
    console.log("  Transfers ingested:", r.newTransfers);
    if (r.snapshot) {
      const s = r.snapshot;
      console.log(`  Strategy: $${s.usd.stratUsd.toFixed(2)} vs HODL $${s.usd.hodlUsd.toFixed(2)} = Δ $${s.usd.deltaUsd.toFixed(2)} (${s.usd.deltaPct.toFixed(2)}%)`);
    }
  }
  console.log("\nBackfill complete.");
}
main().catch(e => { console.error(e); process.exit(1); });
