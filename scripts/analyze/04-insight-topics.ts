import "dotenv/config";
import { createThirdwebClient, prepareEvent } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";

const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
const NPM  = "0x827922686190790b37229fd06084350e74485b72";

const ADDR_PADDED = "0x000000000000000000000000" + ADDR.slice(2).toLowerCase();
const SINCE = Math.floor(Date.now()/1000) - 12*86400;

const ERC20_TRANSFER = prepareEvent({ signature: "event Transfer(address indexed from, address indexed to, uint256 value)" });
const ERC721_TRANSFER = prepareEvent({ signature: "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" });

async function scanToken(label: string, contract: string, inbound: boolean) {
  const out: any[] = [];
  let page = 0;
  while (true) {
    const events = await Insight.getContractEvents({
      client, chains: [base],
      contractAddress: contract as `0x${string}`,
      event: ERC20_TRANSFER,
      decodeLogs: true,
      queryOptions: {
        filter_block_timestamp_gte: SINCE,
        [inbound ? "filter_topic_2" : "filter_topic_1"]: ADDR_PADDED,
        sort_by: "block_number", sort_order: "asc",
        limit: 500, page,
      },
    } as any);
    if (!events.length) break;
    out.push(...events);
    if (events.length < 500) break;
    page++;
  }
  console.log(`\n${label}: ${out.length}`);
  for (const e of out) {
    const d = (e as any).decoded;
    const v = d?.non_indexed_params?.value;
    const from = d?.indexed_params?.from;
    const to = d?.indexed_params?.to;
    console.log(`  blk=${e.block_number} ts=${e.block_timestamp} from=${from} to=${to} value=${v} tx=${e.transaction_hash}`);
  }
  return out;
}

async function scanNFT(label: string, inbound: boolean) {
  const out: any[] = [];
  let page = 0;
  while (true) {
    const events = await Insight.getContractEvents({
      client, chains: [base],
      contractAddress: NPM as `0x${string}`,
      event: ERC721_TRANSFER,
      decodeLogs: true,
      queryOptions: {
        filter_block_timestamp_gte: SINCE,
        [inbound ? "filter_topic_2" : "filter_topic_1"]: ADDR_PADDED,
        sort_by: "block_number", sort_order: "asc",
        limit: 500, page,
      },
    } as any);
    if (!events.length) break;
    out.push(...events);
    if (events.length < 500) break;
    page++;
  }
  console.log(`\n${label}: ${out.length}`);
  for (const e of out) {
    const d = (e as any).decoded;
    console.log(`  blk=${e.block_number} ts=${e.block_timestamp} from=${d?.indexed_params?.from} to=${d?.indexed_params?.to} tokenId=${d?.indexed_params?.tokenId} tx=${e.transaction_hash}`);
  }
  return out;
}

async function main() {
  await scanToken("AERO IN", AERO, true);
  await scanToken("AERO OUT", AERO, false);
  await scanToken("WETH IN", WETH, true);
  await scanToken("WETH OUT", WETH, false);
  await scanToken("cbBTC IN", CBBTC, true);
  await scanToken("cbBTC OUT", CBBTC, false);
  await scanNFT("NPM 721 IN to Safe", true);
  await scanNFT("NPM 721 OUT from Safe", false);
}
main().catch(e=>{console.error(e); process.exit(1);});
