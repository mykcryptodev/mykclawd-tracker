import "dotenv/config";
import { runMigrations } from "../db/migrate";
import { ingestAeroMonitor } from "../lib/aero";
async function main() {
  await runMigrations();
  console.log("Running aero monitor…");
  const r = await ingestAeroMonitor(14);
  console.log("Position:", r.position ? `${r.position.tokenMeta0.sym}/${r.position.tokenMeta1.sym}` : "none");
  console.log("New transfers:", r.newTransfers);
  if (r.snapshot) {
    console.log(`Strategy: $${r.snapshot.usd.stratUsd.toFixed(2)} vs HODL $${r.snapshot.usd.hodlUsd.toFixed(2)} = Δ $${r.snapshot.usd.deltaUsd.toFixed(2)} (${r.snapshot.usd.deltaPct.toFixed(2)}%)`);
    console.log(`AERO: ${(r.snapshot.end.walletAero+r.snapshot.end.pendingAero).toFixed(2)} = $${r.snapshot.usd.aeroAddedUsd.toFixed(2)}`);
    console.log(`Gas: ${r.snapshot.usd.totalGasEth.toFixed(8)} ETH = $${r.snapshot.usd.totalGasUsd.toFixed(2)} (${r.snapshot.gasTxsCounted} txs)`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
