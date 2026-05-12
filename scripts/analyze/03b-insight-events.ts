import "dotenv/config";
import { createThirdwebClient, getContract } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";

const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
const NPM = "0x827922686190790b37229fd06084350e74485b72";

// 10 days
const SINCE = Math.floor(Date.now()/1000) - 10*86400;

async function listContractEvents(contractAddress: string, label: string) {
  try {
    const events = await Insight.getContractEvents({
      client,
      chains: [base],
      contractAddress: contractAddress as `0x${string}`,
      // No filter - rely on time
      decodeLogs: true,
      // limit / sorting?
    } as any);
    console.log(`\n${label} (contract=${contractAddress.slice(0,10)}...): events typeof=${typeof events} keys=${Object.keys(events||{}).slice(0,8).join(",")}`);
    const arr = Array.isArray(events) ? events : (events as any).data || [];
    console.log(`  rows=${arr.length}, first row keys=${Object.keys(arr[0]||{}).slice(0,12).join(",")}`);
    for (const e of arr.slice(0,3)) {
      console.log("  sample:", JSON.stringify(e).slice(0,200));
    }
  } catch (e) {
    console.log(`${label} err:`, (e as Error).message.slice(0,200));
  }
}

async function main() {
  // Hello: see what fields are in events
  await listContractEvents(NPM, "NPM events");
}
main().catch(e=>{console.error(e); process.exit(1);});
