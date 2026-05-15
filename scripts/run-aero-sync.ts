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
    const h = r.snapshot.health;
    console.log(`Health: netBenefit=$${h.netBenefitUsd.toFixed(2)} (${h.netBenefitPct.toFixed(2)}%) coverage=${h.coverageRatio === 99 ? '∞' : h.coverageRatio.toFixed(2)}x`);
    if (h.aeroVelocityPerHr !== null) console.log(`  AERO velocity: $${h.aeroVelocityPerHr.toFixed(4)}/hr | LP drag velocity: $${(h.lpDeltaVelocityPerHr ?? 0).toFixed(4)}/hr`);
  }
  if (r.monitor) {
    console.log(`Monitor: ${r.monitor.level}${r.monitor.reasons.length ? ' — ' + r.monitor.reasons[0] : ''}${r.monitor.sent ? ' [alert sent]' : ''}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
