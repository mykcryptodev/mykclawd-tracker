import "dotenv/config";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH  = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO  = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";

const balAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function snapshot(block: bigint, label: string) {
  const eth = await rpc.getBalance({ address: ADDR as `0x${string}`, blockNumber: block });
  const weth = await rpc.readContract({ address: WETH as `0x${string}`, abi: balAbi, functionName: "balanceOf", args: [ADDR as `0x${string}`], blockNumber: block }) as bigint;
  const cbbtc = await rpc.readContract({ address: CBBTC as `0x${string}`, abi: balAbi, functionName: "balanceOf", args: [ADDR as `0x${string}`], blockNumber: block }) as bigint;
  const aero = await rpc.readContract({ address: AERO as `0x${string}`, abi: balAbi, functionName: "balanceOf", args: [ADDR as `0x${string}`], blockNumber: block }) as bigint;
  const ts = (await rpc.getBlock({ blockNumber: block })).timestamp;
  console.log(`${label} block=${block} ts=${new Date(Number(ts)*1000).toISOString()}`);
  console.log(`  ETH=${(Number(eth)/1e18).toFixed(6)}  WETH=${(Number(weth)/1e18).toFixed(6)}  cbBTC=${(Number(cbbtc)/1e8).toFixed(6)}  AERO=${(Number(aero)/1e18).toFixed(2)}`);
}

async function main() {
  const head = await rpc.getBlockNumber();
  // 30 days, 14 days, 7 days, 1 day before head, plus first activity block
  const snapshots: Array<[bigint,string]> = [
    [head - 1_296_000n, "30 days ago"],
    [head - 604_800n, "14 days ago"],
    [head - 302_400n, "7 days ago"],
    [45645988n, "just before LP started"],
    [head, "NOW"],
  ];
  for (const [b, l] of snapshots) await snapshot(b, l);
}
main().catch(e=>{console.error(e); process.exit(1);});
