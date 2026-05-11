import { createThirdwebClient } from "thirdweb";
import { Insight } from "thirdweb";
import { base } from "thirdweb/chains";
import { db } from "../db/client";
import { lots, tokens } from "../db/schema";

const ADDRESS = (process.env.TRACKED_ADDRESS ?? "0xcef6e6639e0c60d5c0805670f4363a6698081fab") as `0x${string}`;
const CLIENT_ID = "557f87ce81018621d2ddefa9c462ea42";

async function main() {
  const client = createThirdwebClient({ clientId: CLIENT_ID });

  console.log("Fetching token balances from ThirdWeb...\n");

  const owned = await Insight.getOwnedTokens({
    client,
    chains: [base],
    ownerAddress: ADDRESS,
  });

  console.log(`ThirdWeb found ${owned.length} tokens with non-zero balance\n`);

  // Build lookup maps from our DB
  const allLots = db.select().from(lots).all();
  const allTokens = db.select().from(tokens).all();
  const lotMap = new Map(allLots.map((l) => [l.tokenAddress.toLowerCase(), parseFloat(l.quantity)]));
  const tokenMap = new Map(allTokens.map((t) => [t.contractAddress.toLowerCase(), t]));

  console.log("Token".padEnd(12) + " | " + "ThirdWeb Balance".padStart(20) + " | " + "Our Balance".padStart(20) + " | " + "Diff%".padStart(8));
  console.log("-".repeat(68));

  let mismatches = 0;

  for (const token of owned) {
    const addr = token.tokenAddress.toLowerCase();
    const twBalance = parseFloat(token.displayValue);
    const ourBalance = lotMap.get(addr) ?? 0;
    const diff = twBalance === 0 ? 0 : ((ourBalance - twBalance) / twBalance) * 100;
    const flag = Math.abs(diff) > 1 && twBalance > 0.000001 ? " <<<" : "";
    if (flag) mismatches++;
    const meta = tokenMap.get(addr);
    const sym = (meta?.symbol || addr.slice(0, 10)).padEnd(11);
    console.log(
      `${sym} | ${twBalance.toFixed(6).padStart(20)} | ${ourBalance.toFixed(6).padStart(20)} | ${diff.toFixed(2).padStart(7)}%${flag}`
    );
  }

  // Also flag tokens we track that ThirdWeb didn't return
  const twAddresses = new Set(owned.map((t) => t.tokenAddress.toLowerCase()));
  const ourHeld = allLots.filter((l) => parseFloat(l.quantity) > 0.000001 && !twAddresses.has(l.tokenAddress.toLowerCase()));
  for (const lot of ourHeld) {
    const meta = tokenMap.get(lot.tokenAddress.toLowerCase());
    const sym = (meta?.symbol || lot.tokenAddress.slice(0, 10)).padEnd(11);
    console.log(`${sym} | ${"(not in ThirdWeb)".padStart(20)} | ${parseFloat(lot.quantity).toFixed(6).padStart(20)} | ${"N/A".padStart(7)}`);
  }

  console.log(`\n${mismatches} mismatches (>1% diff) out of ${owned.length} ThirdWeb positions`);
}

main();
