import "dotenv/config";
import { createPublicClient, http, parseAbi, decodeFunctionData } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";

async function main() {
  const hashes = [
    "0xa5f8cc0a2dc769706729c3e5f13d7f9c3d94aae3a118d64c5257fa91dd52e87c", // first ETH-spend
    "0xb18b815c0e9f7a185f225eaffee5f1e7af4516665d0d1f40523ec88f8c86c655", // Steakhouse WETH withdraw
  ];
  for (const h of hashes) {
    console.log(`\n=== TX ${h} ===`);
    const tx = await rpc.getTransaction({ hash: h as `0x${string}` });
    const r = await rpc.getTransactionReceipt({ hash: h as `0x${string}` });
    console.log(`from: ${tx.from}`);
    console.log(`to: ${tx.to}`);
    console.log(`value: ${Number(tx.value)/1e18} ETH`);
    console.log(`input len: ${tx.input.length} (${tx.input.slice(0,10)})`);
    console.log(`status: ${r.status}, gasUsed: ${r.gasUsed}, gasPrice: ${r.effectiveGasPrice}`);
    console.log(`logs count: ${r.logs.length}`);
    for (const l of r.logs.slice(0,10)) {
      console.log(`  log addr=${l.address} topic0=${l.topics[0]?.slice(0,12)} data_len=${l.data.length}`);
    }
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
