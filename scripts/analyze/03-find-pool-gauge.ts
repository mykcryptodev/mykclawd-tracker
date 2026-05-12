import "dotenv/config";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH = "0x4200000000000000000000000000000000000006" as const;
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" as const;
const AERO = "0x940181a94a35a4569e4529a3cdfb74e38fd98631" as const;
const NPM = "0x827922686190790b37229fd06084350e74485b72" as const;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const TR721 = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

const CHUNK = 50_000n;

async function scan(token: `0x${string}`, fromAddr: boolean, label: string, from: bigint, to: bigint) {
  const all: any[] = [];
  for (let cur = from; cur <= to; cur += CHUNK) {
    const end = cur + CHUNK - 1n > to ? to : cur + CHUNK - 1n;
    try {
      const logs = await client.getLogs({
        address: token, event: TRANSFER,
        args: fromAddr ? { from: ADDR as `0x${string}` } : { to: ADDR as `0x${string}` },
        fromBlock: cur, toBlock: end,
      });
      all.push(...logs);
    } catch (e) { console.log(`  err in ${cur}-${end}: ${(e as Error).message.slice(0,80)}`); }
  }
  console.log(`\n${label} (${all.length} logs)`);
  for (const l of all) {
    const cp = fromAddr ? l.args.to : l.args.from;
    console.log(`  blk=${l.blockNumber} cp=${cp} value=${l.args.value} tx=${l.transactionHash}`);
  }
  return all;
}

async function main() {
  const head = await client.getBlockNumber();
  const from = head - 432_000n; // ~10 days
  console.log(`Scanning blocks ${from} .. ${head} (~10 days) chunk=${CHUNK}`);

  await scan(AERO, false, "AERO IN to Safe", from, head);
  await scan(AERO, true, "AERO OUT from Safe", from, head);
  await scan(WETH, false, "WETH IN to Safe", from, head);
  await scan(WETH, true, "WETH OUT from Safe", from, head);
  await scan(CBBTC, false, "cbBTC IN to Safe", from, head);
  await scan(CBBTC, true, "cbBTC OUT from Safe", from, head);

  console.log("\n=== NPM 721 transfers involving Safe ===");
  const nfts: any[] = [];
  for (let cur = from; cur <= head; cur += CHUNK) {
    const end = cur + CHUNK - 1n > head ? head : cur + CHUNK - 1n;
    try {
      const [a,b] = await Promise.all([
        client.getLogs({ address: NPM, event: TR721, args: { to: ADDR as `0x${string}` }, fromBlock: cur, toBlock: end }),
        client.getLogs({ address: NPM, event: TR721, args: { from: ADDR as `0x${string}` }, fromBlock: cur, toBlock: end }),
      ]);
      nfts.push(...a, ...b);
    } catch (e) { console.log(`  npm err in ${cur}-${end}: ${(e as Error).message.slice(0,80)}`); }
  }
  console.log(`Got ${nfts.length} NPM 721 transfers involving Safe`);
  for (const l of nfts) console.log(`  blk=${l.blockNumber} ${l.args.from} -> ${l.args.to} tokenId=${l.args.tokenId} tx=${l.transactionHash}`);
}
main().catch(e=>{console.error(e); process.exit(1);});
