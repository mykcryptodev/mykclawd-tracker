// Find where the ~3 ETH went between blocks 45674579 and 45703170
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";

async function balAt(b: bigint) {
  return await rpc.getBalance({ address: ADDR as `0x${string}`, blockNumber: b });
}

async function main() {
  // Binary search the exact block where balance dropped
  let lo = 45674579n;
  let hi = 45703170n;
  const startBal = await balAt(lo);
  const endBal = await balAt(hi);
  console.log(`block ${lo}: ${Number(startBal)/1e18}, block ${hi}: ${Number(endBal)/1e18}`);
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const b = await balAt(mid);
    console.log(`  probe ${mid}: ${Number(b)/1e18}`);
    if (b === startBal) lo = mid; else hi = mid;
  }
  console.log(`Drop happened at block ${hi}`);

  // Get the block and its txs
  const block = await rpc.getBlock({ blockNumber: hi, includeTransactions: true });
  console.log(`block ts: ${new Date(Number(block.timestamp)*1000).toISOString()}`);

  // Find txs involving this address
  for (const t of block.transactions) {
    if (typeof t === "string") continue;
    const f = t.from?.toLowerCase();
    const to = (t.to || "").toLowerCase();
    if (f !== ADDR && to !== ADDR) continue;
    console.log(`  TX ${t.hash}: from=${t.from} to=${t.to} value=${Number(t.value)/1e18} input=${t.input?.slice(0,10)}`);
  }

  // Use Insight to look for txs from/to this address in this block range using getTransactions
  console.log("\nFull Insight txs in window:");
  const url = `https://insight.thirdweb.com/v1/transactions?chain_id=8453&filter_block_number_gte=${lo}&filter_block_number_lte=${hi+10n}&filter_from_address=${ADDR}&limit=50`;
  const res = await fetch(url, { headers: { "x-client-id": process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! } });
  const j: any = await res.json();
  for (const t of (j.data || [])) {
    if ((t.value || "0") === "0") continue;
    console.log(`  blk=${t.block_number} from=${t.from_address?.slice(0,10)} to=${t.to_address?.slice(0,10)} value=${Number(t.value)/1e18} hash=${t.hash}`);
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
