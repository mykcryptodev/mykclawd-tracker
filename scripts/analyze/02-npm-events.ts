// Find LP NFT tokenId, pool, and mint/rebalance events
import "dotenv/config";
import { createPublicClient, http, parseAbiItem, getAddress } from "viem";
import { base } from "viem/chains";

const RPC = process.env.BASE_RPC_URL!;
const client = createPublicClient({ chain: base, transport: http(RPC) });

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
// Aerodrome Slipstream NFPM
const NPM = "0x827922686190790b37229fd06084350e74485b72" as const;

async function main() {
  const head = await client.getBlockNumber();
  // 7 days = 7*86400/2 = 302,400 blocks
  const from = head - 302400n;
  console.log(`head=${head} from=${from} (7 days)`);

  // ERC721 Transfer event on NPM contract: (from, to, indexed tokenId)
  const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

  // Chunk-fetch in 1000 block windows
  const CHUNK = 1000n;
  const mints: Array<{tokenId: bigint; block: bigint; tx: string; from: string}> = [];
  const transfersOut: Array<{tokenId: bigint; block: bigint; tx: string; to: string}> = [];

  for (let cur = from; cur <= head; cur += CHUNK) {
    const end = cur + CHUNK - 1n > head ? head : cur + CHUNK - 1n;
    const [toLogs, fromLogs] = await Promise.all([
      client.getLogs({ address: NPM, event: TRANSFER, args: { to: ADDR as `0x${string}` }, fromBlock: cur, toBlock: end }),
      client.getLogs({ address: NPM, event: TRANSFER, args: { from: ADDR as `0x${string}` }, fromBlock: cur, toBlock: end }),
    ]);
    for (const l of toLogs) {
      mints.push({ tokenId: l.args.tokenId!, block: l.blockNumber!, tx: l.transactionHash!, from: l.args.from! });
    }
    for (const l of fromLogs) {
      transfersOut.push({ tokenId: l.args.tokenId!, block: l.blockNumber!, tx: l.transactionHash!, to: l.args.to! });
    }
  }

  console.log(`\n=== NFTs received by Safe (NPM Transfer to=Safe) ===`);
  for (const m of mints) console.log(`  blk=${m.block} tokenId=${m.tokenId.toString()} from=${m.from} tx=${m.tx}`);
  console.log(`\n=== NFTs sent from Safe (NPM Transfer from=Safe) ===`);
  for (const t of transfersOut) console.log(`  blk=${t.block} tokenId=${t.tokenId.toString()} to=${t.to} tx=${t.tx}`);

  // For each unique tokenId, query positions() on the NPM to get pool, tickLower, tickUpper, liquidity
  const uniq = [...new Set([...mints.map(m=>m.tokenId.toString()), ...transfersOut.map(t=>t.tokenId.toString())])];
  console.log(`\nUnique tokenIds touched: ${uniq.length}`);

  // Aerodrome NPM positions() ABI (returns: nonce, operator, token0, token1, tickSpacing, tickLower, tickUpper, liquidity, ...)
  const positionsAbi = [{
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "positions",
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "tickSpacing", type: "int24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  }] as const;
  const ownerAbi = [{ inputs: [{name:"tokenId",type:"uint256"}], name:"ownerOf", outputs:[{type:"address"}], stateMutability:"view", type:"function" }] as const;

  for (const idStr of uniq) {
    try {
      const id = BigInt(idStr);
      const pos = await client.readContract({ address: NPM, abi: positionsAbi, functionName: "positions", args: [id] }) as any;
      const owner = await client.readContract({ address: NPM, abi: ownerAbi, functionName: "ownerOf", args: [id] }) as string;
      console.log(`\n  tokenId=${idStr}`);
      console.log(`    owner now: ${owner}`);
      console.log(`    token0:    ${pos[2]}`);
      console.log(`    token1:    ${pos[3]}`);
      console.log(`    tickSpacing: ${pos[4]}`);
      console.log(`    tickLower:   ${pos[5]}`);
      console.log(`    tickUpper:   ${pos[6]}`);
      console.log(`    liquidity:   ${pos[7].toString()}`);
      console.log(`    tokensOwed0: ${pos[10].toString()}`);
      console.log(`    tokensOwed1: ${pos[11].toString()}`);
    } catch (e) { console.log(`  tokenId=${idStr} err=${(e as Error).message.slice(0,120)}`); }
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
