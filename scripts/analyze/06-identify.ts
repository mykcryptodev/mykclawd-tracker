import "dotenv/config";
import { createPublicClient, http, parseAbi, erc20Abi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDRS = [
  "0x42d4a22cad0f5a49681a5715ce994af73a43b76b",
  "0xcaf22ce31298cf2bf1d152862f80216478ad7c67",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
  "0x61e0b10423a0009c3f83ab4313813d29437d0817",
  "0x4e1d2d808c5b8bbfdfefcb4a46151483eba6aebd",
];

const abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function gauge() view returns (address)",
  "function stakingToken() view returns (address)",
  "function rewardToken() view returns (address)",
  "function pool() view returns (address)",
  "function asset() view returns (address)",
  "function nft() view returns (address)",
]);

async function probe(addr: `0x${string}`) {
  console.log(`\n=== ${addr} ===`);
  const code = await client.getCode({ address: addr });
  console.log(`  bytecode bytes: ${code?.length ?? 0}`);

  for (const fn of ["name","symbol","token0","token1","fee","tickSpacing","gauge","stakingToken","rewardToken","pool","asset","nft"] as const) {
    try {
      const r = await client.readContract({ address: addr, abi, functionName: fn });
      console.log(`  ${fn}(): ${r}`);
    } catch { /* fn not present */ }
  }

  // BlockScout name lookup
  try {
    const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${addr}`);
    const json: any = await res.json();
    console.log(`  blockscout name: ${json.name || json.token?.name || "(none)"} | impl: ${json.implementations?.[0]?.name}`);
  } catch (e) { console.log("  blockscout err"); }
}

async function main() {
  for (const a of ADDRS) await probe(a as `0x${string}`);
}
main().catch(e=>{console.error(e); process.exit(1);});
