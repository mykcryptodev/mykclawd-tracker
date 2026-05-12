import "dotenv/config";
import { createThirdwebClient } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! });

async function main() {
  console.log("Insight methods on this version:");
  console.log(Object.keys(Insight));

  // Try a few likely calls
  console.log("\n--- owned tokens (current) ---");
  try {
    const owned = await Insight.getOwnedTokens({ client, chains: [base], ownerAddress: ADDR as `0x${string}` });
    for (const t of owned) {
      console.log(`  ${t.tokenAddress} | ${(t as any).symbol||"?"} | ${(t as any).displayValue||(t as any).value}`);
    }
  } catch (e) { console.log("err:", (e as Error).message.slice(0,200)); }

  console.log("\n--- owned NFTs ---");
  try {
    const nfts = await Insight.getOwnedNFTs({ client, chains: [base], ownerAddress: ADDR as `0x${string}` });
    for (const n of nfts as any[]) {
      console.log(`  ${n.tokenAddress} #${n.tokenId} | metadata=${JSON.stringify(n.metadata||{}).slice(0,80)}`);
    }
  } catch (e) { console.log("err:", (e as Error).message.slice(0,200)); }

  console.log("\n--- transactions ---");
  try {
    const txs = await Insight.getTransactions({ client, chains: [base], walletAddress: ADDR as `0x${string}`, limit: 100 } as any);
    console.log("Got txs:", (txs as any).length || Object.keys(txs).length);
    for (const t of (txs as any).slice(0,30)) console.log(`  blk=${t.blockNumber} ts=${t.blockTimestamp} to=${t.to} method=${(t.functionSelector||t.functionName||"").slice(0,20)} hash=${t.hash||t.transactionHash}`);
  } catch (e) { console.log("err:", (e as Error).message.slice(0,300)); }

  console.log("\n--- token transfers ---");
  try {
    const tts = await (Insight as any).getTokenTransfers({ client, chains: [base], walletAddress: ADDR as `0x${string}`, limit: 100 });
    console.log("Got token transfers:", (tts as any).length);
    for (const t of (tts as any).slice(0,30)) console.log(`  blk=${t.blockNumber} ${t.from?.slice(0,10)} -> ${t.to?.slice(0,10)} ${t.value} (${t.tokenAddress?.slice(0,10)}) ${t.transactionHash}`);
  } catch (e) { console.log("err:", (e as Error).message.slice(0,300)); }
}
main().catch(e => { console.error(e); process.exit(1); });
