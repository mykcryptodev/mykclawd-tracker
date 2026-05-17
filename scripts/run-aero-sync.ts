import "dotenv/config";
import { runMigrations } from "../db/migrate";
import { ingestAeroMonitor, setMonitoredAddress } from "../lib/aero";

const ADDRESSES = [
  { address: "0xf142022273602c6a6c0ea7a044d21082273bd686", label: "mykclawd" },
  { address: "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7", label: "wishlist.holiday" },
  { address: "0x4d63da43f74e864f069f908465f2f3f13977976e", label: "yield.myk.eth" },
];

async function main() {
  await runMigrations();
  for (const { address, label } of ADDRESSES) {
    console.log(`\n=== Running aero monitor for ${label} (${address}) ===`);
    await setMonitoredAddress(address);
    const r = await ingestAeroMonitor(14);
    console.log("Position:", r.position ? `${r.position.tokenMeta0.sym}/${r.position.tokenMeta1.sym}` : "none");
    console.log("New transfers:", r.newTransfers);
    if (r.snapshot) {
      console.log(`Strategy: $${r.snapshot.usd.stratUsd.toFixed(2)} vs HODL $${r.snapshot.usd.hodlUsd.toFixed(2)} = Δ $${r.snapshot.usd.deltaUsd.toFixed(2)} (${r.snapshot.usd.deltaPct.toFixed(2)}%)`);
      console.log(`AERO: ${(r.snapshot.end.walletAero + r.snapshot.end.pendingAero).toFixed(2)} = $${r.snapshot.usd.aeroAddedUsd.toFixed(2)}`);
      console.log(`Gas: ${r.snapshot.usd.totalGasEth.toFixed(8)} ETH = $${r.snapshot.usd.totalGasUsd.toFixed(2)} (${r.snapshot.gasTxsCounted} txs)`);
      const h = r.snapshot.health;
      console.log(`Health: netBenefit=$${h.netBenefitUsd.toFixed(2)} (${h.netBenefitPct.toFixed(2)}%) coverage=${h.coverageRatio === 99 ? "∞" : h.coverageRatio.toFixed(2)}x`);
      if (h.aeroVelocityPerHr !== null) console.log(`  AERO velocity: $${h.aeroVelocityPerHr.toFixed(4)}/hr | LP drag velocity: $${(h.lpDeltaVelocityPerHr ?? 0).toFixed(4)}/hr`);
    }
    if (r.monitor) {
      console.log(`Monitor: ${r.monitor.level}${r.monitor.reasons.length ? " — " + r.monitor.reasons[0] : ""}${r.monitor.sent ? " [alert sent]" : ""}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
