import "dotenv/config";
import { createThirdwebClient, prepareEvent } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";
import { createPublicClient, http, parseAbi } from "viem";
import { base as viemBase } from "viem/chains";

const tw = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });
const rpc = createPublicClient({ chain: viemBase, transport: http(process.env.COINBASE_RPC_URL!) });

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const ADDR_PADDED = "0x000000000000000000000000" + ADDR.slice(2).toLowerCase();
const NPM = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const POOL = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";
const GAUGE = "0x61E0B10423a0009C3f83ab4313813d29437d0817";
const SINCE = Math.floor(Date.now()/1000) - 60*86400; // 60 days back

const TR721 = prepareEvent({ signature: "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" });

async function scanNFT(topic2: string) {
  const out: any[] = [];
  let page = 0;
  while (true) {
    const events: any[] = await Insight.getContractEvents({
      client: tw, chains: [base],
      contractAddress: NPM,
      event: TR721,
      decodeLogs: true,
      queryOptions: {
        filter_block_timestamp_gte: SINCE,
        filter_topic_2: topic2,
        sort_by: "block_number", sort_order: "asc",
        limit: 500, page,
      },
    } as any);
    if (!events.length) break;
    out.push(...events);
    if (events.length < 500) break;
    page++;
  }
  return out;
}

async function main() {
  console.log("Looking for NFT Transfers to Safe (60d window):");
  const toSafe = await scanNFT(ADDR_PADDED);
  for (const e of toSafe) {
    const from = "0x"+e.topics[1].slice(26);
    const tokenId = BigInt(e.topics[3]).toString();
    console.log(`  blk=${e.block_number} ts=${e.block_timestamp} from=${from} tokenId=${tokenId} tx=${e.transaction_hash}`);
  }

  console.log("\nLooking for NFT Transfers from Safe:");
  const fromSafe = await scanNFT(""); // can't filter from, do separate query
  // Actually let me do it via topic_1
  const out2: any[] = [];
  let page = 0;
  while (true) {
    const events: any[] = await Insight.getContractEvents({
      client: tw, chains: [base],
      contractAddress: NPM, event: TR721, decodeLogs: true,
      queryOptions: {
        filter_block_timestamp_gte: SINCE,
        filter_topic_1: ADDR_PADDED,
        sort_by: "block_number", sort_order: "asc", limit: 500, page,
      },
    } as any);
    if (!events.length) break;
    out2.push(...events);
    if (events.length < 500) break;
    page++;
  }
  for (const e of out2) {
    const to = "0x"+e.topics[2].slice(26);
    const tokenId = BigInt(e.topics[3]).toString();
    console.log(`  blk=${e.block_number} ts=${e.block_timestamp} to=${to} tokenId=${tokenId} tx=${e.transaction_hash}`);
  }

  // Also: scan transfers to the gauge to see what tokenIds are staked there
  console.log("\nLooking for NFT Transfers to the Gauge (60d window):");
  const GAUGE_PADDED = "0x000000000000000000000000" + GAUGE.slice(2).toLowerCase();
  const toGauge = await scanNFT(GAUGE_PADDED);
  console.log(`  ${toGauge.length} NFTs transferred to gauge in last 60d`);
  // dedupe by tokenId, show recent ones
  const byId: Record<string, any> = {};
  for (const e of toGauge) {
    const tokenId = BigInt(e.topics[3]).toString();
    byId[tokenId] = e;
  }

  // For each tokenId staked in the gauge in last 60d, check if the original mint had Safe as recipient
  // by querying NPM positions
  const positionsAbi = parseAbi([
    "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
    "function ownerOf(uint256) view returns (address)",
  ]);

  console.log(`\nFiltering for positions in our WETH/cbBTC CL pool (0x42d4...)`);
  let found = 0;
  for (const tokenId of Object.keys(byId).slice(0, 200)) {
    try {
      const pos: any = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "positions", args: [BigInt(tokenId)] });
      // pos[2] = token0, pos[3] = token1 — match our pool tokens
      if (pos[2].toLowerCase() !== "0x4200000000000000000000000000000000000006") continue;
      if (pos[3].toLowerCase() !== "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf") continue;
      // Check tickSpacing matches (10)
      if (pos[4] !== 10) continue;

      // Now check ownerOf — if owner is the gauge, query gauge for the staker
      const owner = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "ownerOf", args: [BigInt(tokenId)] });
      const stakerAbi = parseAbi(["function stakedContains(address depositor, uint256 tokenId) view returns (bool)"]);
      let isOurs = false;
      if ((owner as string).toLowerCase() === GAUGE.toLowerCase()) {
        try {
          isOurs = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: stakerAbi, functionName: "stakedContains", args: [ADDR as `0x${string}`, BigInt(tokenId)] }) as boolean;
        } catch { /* function name guess wrong */ }
      }
      if (!isOurs) continue;
      found++;
      console.log(`\n  MATCH tokenId=${tokenId}`);
      console.log(`    owner=${owner} (gauge)`);
      console.log(`    tickLower=${pos[5]} tickUpper=${pos[6]}`);
      console.log(`    liquidity=${pos[7]}`);
      console.log(`    tokensOwed0=${pos[10]} tokensOwed1=${pos[11]}`);
    } catch (e) { /* skip */ }
  }
  console.log(`\nFound ${found} matching tokenIds in our pool that are staked by Safe.`);
}
main().catch(e=>{console.error(e); process.exit(1);});
