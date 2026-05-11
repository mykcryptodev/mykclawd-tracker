import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const WETH = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const ADDR = "0xcef6e6639e0c60d5c0805670f4363a6698081fab" as `0x${string}`;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

async function testRange(name: string, url: string, from: bigint, to: bigint) {
  const client = createPublicClient({ chain: base, transport: http(url) });
  try {
    const logs = await client.getLogs({
      address: WETH,
      event: TRANSFER,
      args: { from: ADDR },
      fromBlock: from,
      toBlock: to,
    });
    console.log(`${name} | range=${Number(to - from + 1n).toLocaleString()} | OK | ${logs.length} logs`);
  } catch (e) {
    console.log(`${name} | range=${Number(to - from + 1n).toLocaleString()} | FAIL | ${(e as Error).message.slice(0, 80)}`);
  }
}

async function main() {
  const THIRDWEB = process.env.BASE_RPC_URL!;
  const COINBASE = process.env.COINBASE_RPC_URL!;
  const START = 42_246_804n;

  for (const range of [1_000n, 2_000n, 5_000n, 10_000n, 50_000n, 100_000n]) {
    await testRange("ThirdWeb", THIRDWEB, START, START + range - 1n);
    await testRange("Coinbase", COINBASE, START, START + range - 1n);
    console.log("");
  }
}

main();
