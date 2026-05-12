// Trace ETH movements & WETH wraps
import "dotenv/config";
import { readFileSync } from "fs";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const ZERO = "0x0000000000000000000000000000000000000000";

interface Row { sym: string; dir: "in"|"out"; block: number; ts: number; from: string; to: string; value: string; tx: string }

async function main() {
  const data = JSON.parse(readFileSync("data/aero-analysis.json","utf-8")) as { rows: Row[]; txs: any[] };

  // WETH IN from zero (mints = wraps from ETH)
  const wraps = data.rows.filter(r=>r.sym==="WETH" && r.dir==="in" && r.from.toLowerCase()===ZERO);
  console.log(`WETH MINT (wrap from ETH): ${wraps.length} events`);
  let totalWrapped = 0n;
  for (const w of wraps) {
    totalWrapped += BigInt(w.value);
    console.log(`  ${new Date(w.ts*1000).toISOString()} | +${(Number(w.value)/1e18).toFixed(8)} WETH | tx=${w.tx}`);
  }
  console.log(`Total wrapped: ${(Number(totalWrapped)/1e18).toFixed(8)} ETH→WETH\n`);

  // WETH OUT to zero (burns = unwraps)
  const unwraps = data.rows.filter(r=>r.sym==="WETH" && r.dir==="out" && r.to.toLowerCase()===ZERO);
  console.log(`WETH BURN (unwrap to ETH): ${unwraps.length} events`);
  let totalUnwrapped = 0n;
  for (const w of unwraps) {
    totalUnwrapped += BigInt(w.value);
    console.log(`  ${new Date(w.ts*1000).toISOString()} | -${(Number(w.value)/1e18).toFixed(8)} WETH | tx=${w.tx}`);
  }
  console.log(`Total unwrapped: ${(Number(totalUnwrapped)/1e18).toFixed(8)} WETH→ETH\n`);

  // Get ETH balance throughout the window (sample every ~12h)
  const firstBlock = BigInt(data.rows[0].block) - 1n;
  const lastBlock = await rpc.getBlockNumber();
  const samples = 8;
  const step = (lastBlock - firstBlock) / BigInt(samples);
  console.log(`ETH balance over time:`);
  for (let i = 0; i <= samples; i++) {
    const b = firstBlock + step * BigInt(i);
    const bal = await rpc.getBalance({ address: ADDR as `0x${string}`, blockNumber: b });
    const block = await rpc.getBlock({ blockNumber: b });
    console.log(`  block=${b} ts=${new Date(Number(block.timestamp)*1000).toISOString()} ETH=${(Number(bal)/1e18).toFixed(6)}`);
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
