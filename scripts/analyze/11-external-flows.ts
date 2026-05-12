// Look for external capital flowing into Safe (beyond the pool/router/CoW/gauge)
import "dotenv/config";
import { readFileSync } from "fs";

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const POOL  = "0x42d4a22cad0f5a49681a5715ce994af73a43b76b";
const ROUTER = "0xcaf22ce31298cf2bf1d152862f80216478ad7c67";
const COW = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const GAUGE = "0x61e0b10423a0009c3f83ab4313813d29437d0817";

interface Row { sym: string; dir: "in"|"out"; block: number; ts: number; from: string; to: string; value: string; tx: string }

function fmt(v: string, dec: number) { return (Number(BigInt(v))/10**dec).toFixed(8); }

async function main() {
  const data = JSON.parse(readFileSync("data/aero-analysis.json","utf-8")) as { rows: Row[]; txs: any[] };
  console.log(`=== ALL INCOMING transfers (Safe perspective) ===\n`);
  const STRAT = new Set([POOL, ROUTER, COW, GAUGE]);

  const inbound = data.rows.filter(r=>r.dir==="in").sort((a,b)=>a.ts-b.ts);
  console.log(`Total inbound transfers: ${inbound.length}`);

  console.log(`\n--- Inbound from EXTERNAL (not pool/router/CoW/gauge) ---`);
  let extWETH = 0n, extCBBTC = 0n, extAERO = 0n;
  for (const r of inbound) {
    if (STRAT.has(r.from.toLowerCase())) continue;
    const dec = r.sym==="cbBTC"?8:18;
    console.log(`  ${new Date(r.ts*1000).toISOString()} | ${r.sym} ${fmt(r.value,dec)} from ${r.from} | tx=${r.tx}`);
    if (r.sym==="WETH") extWETH += BigInt(r.value);
    if (r.sym==="cbBTC") extCBBTC += BigInt(r.value);
    if (r.sym==="AERO") extAERO += BigInt(r.value);
  }
  console.log(`\nEXTERNAL inflows total:`);
  console.log(`  WETH:  ${(Number(extWETH)/1e18).toFixed(8)}`);
  console.log(`  cbBTC: ${(Number(extCBBTC)/1e8).toFixed(8)}`);
  console.log(`  AERO:  ${(Number(extAERO)/1e18).toFixed(6)}`);

  console.log(`\n--- All outbound to external (not pool/router/CoW/gauge) ---`);
  const outbound = data.rows.filter(r=>r.dir==="out").sort((a,b)=>a.ts-b.ts);
  for (const r of outbound) {
    if (STRAT.has(r.to.toLowerCase())) continue;
    const dec = r.sym==="cbBTC"?8:18;
    console.log(`  ${new Date(r.ts*1000).toISOString()} | ${r.sym} ${fmt(r.value,dec)} to ${r.to} | tx=${r.tx}`);
  }

  // ETH activity from txs
  console.log(`\n--- Native ETH activity (from txs) ---`);
  for (const t of data.txs.sort((a:any,b:any)=>a.ts-b.ts)) {
    const v = BigInt(t.value || "0");
    if (v === 0n) continue;
    const dir = t.to?.toLowerCase() === ADDR ? "IN" : "OUT";
    console.log(`  ${new Date(t.ts*1000).toISOString()} | ETH ${dir} ${(Number(v)/1e18).toFixed(8)} ${dir==="IN"?"from "+t.from:"to "+t.to} | ${t.hash}`);
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
