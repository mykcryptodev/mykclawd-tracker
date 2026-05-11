import { db } from "../db/client";
import { lots, tokens } from "../db/schema";
import { publicClient, NATIVE_TOKEN_ADDRESS } from "../lib/rpc";
import { erc20Abi } from "viem";

const ADDRESS = (process.env.TRACKED_ADDRESS ?? "0xcef6e6639e0c60d5c0805670f4363a6698081fab") as `0x${string}`;

async function main() {
  const allLots = db.select().from(lots).all();
  const tokenMap = new Map(db.select().from(tokens).all().map((t) => [t.contractAddress, t]));

  const held = allLots
    .map((l) => ({ ...l, qty: parseFloat(l.quantity) }))
    .filter((l) => l.qty > 0.000001);

  console.log(`Checking ${held.length} positions against on-chain balanceOf...\n`);
  console.log("Token".padEnd(14) + "| Our Balance".padStart(16) + " | On-Chain".padStart(16) + " | Diff%".padStart(8));
  console.log("-".repeat(56));

  let mismatches = 0;

  for (const lot of held) {
    const meta = tokenMap.get(lot.tokenAddress);
    const sym = (meta?.symbol || lot.tokenAddress.slice(0, 10)).padEnd(13);
    try {
      let onChain: number;
      if (lot.tokenAddress === NATIVE_TOKEN_ADDRESS) {
        const wei = await publicClient.getBalance({ address: ADDRESS });
        onChain = Number(wei) / 1e18;
      } else {
        const raw = await publicClient.readContract({
          address: lot.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [ADDRESS],
        });
        onChain = Number(raw) / 10 ** (meta?.decimals ?? 18);
      }
      const diff = lot.qty === 0 ? 0 : ((onChain - lot.qty) / lot.qty) * 100;
      const flag = Math.abs(diff) > 1 ? " <<<" : "";
      if (flag) mismatches++;
      console.log(
        `${sym}| ${lot.qty.toFixed(4).padStart(14)} | ${onChain.toFixed(4).padStart(14)} | ${diff.toFixed(2).padStart(6)}%${flag}`
      );
    } catch {
      console.log(`${sym}| ${"".padStart(14)} | ${"RPC ERROR".padStart(14)} |`);
    }
  }

  console.log(`\n${mismatches} mismatches (>1% diff) out of ${held.length} positions`);
}

main();
