// Full PnL analysis: cost basis, current value, gas paid, AERO value, vs HODL
import "dotenv/config";
import { readFileSync } from "fs";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { getCodexDailyPrices } from "../../lib/codex";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH  = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO  = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
const NPM   = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const GAUGE = "0x61E0B10423a0009C3f83ab4313813d29437d0817";
const POOL  = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";
const UNIVERSAL_ROUTER = "0xcaf22ce31298cf2bf1d152862f80216478ad7c67";
const COW = "0x9008d19f58aabd9ed0d60971565aa8510560ab41";

const positionsAbi = parseAbi([
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);
const gaugeAbi = parseAbi([
  "function earned(address account, uint256 tokenId) view returns (uint256)",
  "function stakedValues(address) view returns (uint256[])",
]);
const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
]);

interface Row { token: string; sym: string; dir: "in"|"out"; block: number; ts: number; from: string; to: string; value: string; tx: string }
interface Tx  { hash: string; block: number; ts: number; from: string; to: string; method: string; value: string; gas_used: string; gas_price: string; status: string }

function loadData() {
  const j = JSON.parse(readFileSync("data/aero-analysis.json","utf-8")) as { since: number; rows: Row[]; txs: Tx[] };
  return j;
}

async function main() {
  const data = loadData();
  console.log(`\nLoaded ${data.rows.length} transfer rows + ${data.txs.length} txs (since ${new Date(data.since*1000).toISOString()})`);

  // 1) NET FLOWS PER TOKEN
  const NET: Record<string, { in: bigint; out: bigint; decimals: number }> = {
    WETH:  { in: 0n, out: 0n, decimals: 18 },
    cbBTC: { in: 0n, out: 0n, decimals: 8  },
    AERO:  { in: 0n, out: 0n, decimals: 18 },
  };
  for (const r of data.rows) {
    NET[r.sym][r.dir] += BigInt(r.value);
  }
  function fmt(n: bigint, d: number) { return (Number(n) / 10**d).toFixed(8); }
  console.log("\n=== NET FLOWS (Safe perspective) ===");
  for (const [sym,t] of Object.entries(NET)) {
    console.log(`  ${sym}: in=${fmt(t.in,t.decimals)}  out=${fmt(t.out,t.decimals)}  NET=${fmt(t.in-t.out,t.decimals)}`);
  }

  // 2) ENTRY/ACTIVITY WINDOW
  const sorted = [...data.rows].sort((a,b)=>a.ts-b.ts);
  const firstTs = sorted[0].ts;
  const lastTs  = sorted[sorted.length-1].ts;
  console.log(`\n=== ACTIVITY WINDOW ===`);
  console.log(`  First tx: ${new Date(firstTs*1000).toISOString()} (block ${sorted[0].block})`);
  console.log(`  Last tx:  ${new Date(lastTs*1000).toISOString()} (block ${sorted[sorted.length-1].block})`);
  console.log(`  Span:     ${((lastTs-firstTs)/86400).toFixed(2)} days`);

  // 3) GAS COSTS — only count txs initiated by the Safe (where from=Safe is NOT the case for a Safe; the relayer is from. But the gas is paid by tx.from = signer.)
  // Use the txs from BlockScout; sum gas_used * gas_price for each tx that is in our activity window AND is a "Safe tx"
  // Easier: look at the unique transaction hashes from our transfer rows
  const uniqHashes = new Set(data.rows.map(r=>r.tx));
  const txByHash = new Map(data.txs.map(t=>[t.hash, t]));
  console.log(`\n=== GAS COSTS ===`);
  console.log(`  Unique txs touching tokens: ${uniqHashes.size}`);
  console.log(`  BlockScout txs returned:    ${data.txs.length}`);

  let totalGasWei = 0n;
  let countedTxs = 0;
  for (const h of uniqHashes) {
    const t = txByHash.get(h);
    if (!t || t.status !== "ok") continue;
    if (!t.gas_used || !t.gas_price) continue;
    const wei = BigInt(t.gas_used) * BigInt(t.gas_price);
    totalGasWei += wei;
    countedTxs++;
  }
  // For txs missing from BlockScout list, fetch on-chain
  const missing = [...uniqHashes].filter(h => !txByHash.has(h));
  console.log(`  Txs missing from blockscout (will fetch on-chain): ${missing.length}`);
  for (const h of missing) {
    try {
      const r = await rpc.getTransactionReceipt({ hash: h as `0x${string}` });
      if (r.status !== "success") continue;
      const tx = await rpc.getTransaction({ hash: h as `0x${string}` });
      const wei = (r.gasUsed) * (r.effectiveGasPrice ?? tx.gasPrice ?? 0n);
      totalGasWei += wei;
      countedTxs++;
    } catch {}
  }
  console.log(`  Total gas paid: ${Number(totalGasWei)/1e18} ETH across ${countedTxs} txs`);
  const totalGasEth = Number(totalGasWei) / 1e18;

  // 4) CURRENT POSITION VALUE (from on-chain)
  const stakedIds = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "stakedValues", args: [ADDR as `0x${string}`] }) as bigint[];
  const slot0: any = await rpc.readContract({ address: POOL as `0x${string}`, abi: poolAbi, functionName: "slot0" });
  const sqrtP = slot0[0] as bigint;
  let totalA0 = 0n, totalA1 = 0n, totalEarnedAERO = 0n;
  for (const tid of stakedIds) {
    const pos: any = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "positions", args: [tid] });
    const earned = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "earned", args: [ADDR as `0x${string}`, tid] }) as bigint;
    totalEarnedAERO += earned;
    const tickToSqrt = (t: number) => BigInt(Math.floor(Math.pow(1.0001, t/2) * 2**96));
    const sqrtL = tickToSqrt(Number(pos[5]));
    const sqrtU = tickToSqrt(Number(pos[6]));
    const L = BigInt(pos[7]);
    const Q96 = 2n**96n;
    let a0=0n,a1=0n;
    if (sqrtP <= sqrtL) a0 = (L * Q96 * (sqrtU - sqrtL)) / (sqrtU * sqrtL);
    else if (sqrtP >= sqrtU) a1 = (L * (sqrtU - sqrtL)) / Q96;
    else { a0 = (L * Q96 * (sqrtU - sqrtP)) / (sqrtU * sqrtP); a1 = (L * (sqrtP - sqrtL)) / Q96; }
    totalA0 += a0; totalA1 += a1;
    // fees still owed
    totalA0 += BigInt(pos[10]); totalA1 += BigInt(pos[11]);
  }
  console.log(`\n=== CURRENT POSITION (sum of staked positions) ===`);
  console.log(`  WETH in position:  ${(Number(totalA0)/1e18).toFixed(8)}`);
  console.log(`  cbBTC in position: ${(Number(totalA1)/1e8).toFixed(8)}`);
  console.log(`  Pending AERO:      ${(Number(totalEarnedAERO)/1e18).toFixed(6)}`);

  // 5) CURRENT WALLET BALANCES (use Insight - already loaded? get fresh)
  const balanceOfAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
  async function bal(token: string) {
    return await rpc.readContract({ address: token as `0x${string}`, abi: balanceOfAbi, functionName: "balanceOf", args: [ADDR as `0x${string}`] }) as bigint;
  }
  const balW = await bal(WETH);
  const balC = await bal(CBBTC);
  const balA = await bal(AERO);
  const balEth = await rpc.getBalance({ address: ADDR as `0x${string}` });
  console.log(`\n=== CURRENT WALLET BALANCES ===`);
  console.log(`  ETH:   ${Number(balEth)/1e18}`);
  console.log(`  WETH:  ${Number(balW)/1e18}`);
  console.log(`  cbBTC: ${Number(balC)/1e8}`);
  console.log(`  AERO:  ${Number(balA)/1e18}`);

  // 6) PRICES (current + at first activity)
  console.log(`\n=== PRICES ===`);
  const wethPrices = await getCodexDailyPrices(WETH);
  const cbbtcPrices = await getCodexDailyPrices(CBBTC);
  const aeroPrices  = await getCodexDailyPrices(AERO);
  function priceAt(prices: Array<[number,number]>, ts: number): number {
    if (!prices.length) return 0;
    // find closest day
    let best = prices[0];
    for (const p of prices) if (Math.abs(p[0]-ts) < Math.abs(best[0]-ts)) best = p;
    return best[1];
  }
  const W_NOW = wethPrices.length ? wethPrices[wethPrices.length-1][1] : 0;
  const C_NOW = cbbtcPrices.length ? cbbtcPrices[cbbtcPrices.length-1][1] : 0;
  const A_NOW = aeroPrices.length ? aeroPrices[aeroPrices.length-1][1] : 0;
  const W_START = priceAt(wethPrices, firstTs);
  const C_START = priceAt(cbbtcPrices, firstTs);
  console.log(`  WETH:  start=$${W_START.toFixed(2)}  now=$${W_NOW.toFixed(2)}  Δ=${((W_NOW/W_START-1)*100).toFixed(2)}%`);
  console.log(`  cbBTC: start=$${C_START.toFixed(2)}  now=$${C_NOW.toFixed(2)}  Δ=${((C_NOW/C_START-1)*100).toFixed(2)}%`);
  console.log(`  AERO:  now=$${A_NOW.toFixed(4)} (price history days: ${aeroPrices.length})`);

  // 7) PnL ANALYSIS
  console.log(`\n=== PnL ANALYSIS ===`);
  // Current position + wallet + pending AERO
  const posWETHnum = Number(totalA0)/1e18;
  const posCBBTCnum = Number(totalA1)/1e8;
  const wallWETH = Number(balW)/1e18;
  const wallCBBTC = Number(balC)/1e8;
  const wallAERO = Number(balA)/1e18;
  const pendAERO = Number(totalEarnedAERO)/1e18;
  const wallETH = Number(balEth)/1e18;

  const posValue = posWETHnum*W_NOW + posCBBTCnum*C_NOW;
  const aeroValue = (wallAERO + pendAERO) * A_NOW;
  const walletValue = wallETH*W_NOW + wallWETH*W_NOW + wallCBBTC*C_NOW + aeroValue;
  console.log(`  Position value (WETH+cbBTC in LP): $${posValue.toFixed(2)}`);
  console.log(`  Wallet WETH+ETH:                    $${((wallETH+wallWETH)*W_NOW).toFixed(2)}`);
  console.log(`  Wallet cbBTC:                       $${(wallCBBTC*C_NOW).toFixed(2)}`);
  console.log(`  AERO (wallet ${wallAERO.toFixed(2)} + pending ${pendAERO.toFixed(2)} = ${(wallAERO+pendAERO).toFixed(2)}) @ $${A_NOW}: $${aeroValue.toFixed(2)}`);
  console.log(`  ---`);
  const currentTotal = posValue + (wallETH+wallWETH)*W_NOW + wallCBBTC*C_NOW + aeroValue;
  console.log(`  CURRENT TOTAL VALUE: $${currentTotal.toFixed(2)}`);

  // ASSUME the user's starting capital was $5k WETH + $5k cbBTC.
  // 5000 / W_START WETH and 5000 / C_START cbBTC at the start
  const startWETH = 5000 / W_START;
  const startCBBTC = 5000 / C_START;
  const hodlValue = startWETH * W_NOW + startCBBTC * C_NOW;
  console.log(`\n=== HODL BASELINE ===`);
  console.log(`  Assumed starting capital: $5,000 WETH + $5,000 cbBTC = $10,000`);
  console.log(`  Implied starting tokens:  ${startWETH.toFixed(6)} WETH + ${startCBBTC.toFixed(8)} cbBTC`);
  console.log(`  HODL value today:         $${hodlValue.toFixed(2)}`);
  console.log(`  Spot HODL P&L:            $${(hodlValue-10000).toFixed(2)} (${((hodlValue/10000-1)*100).toFixed(2)}%)`);

  console.log(`\n=== STRATEGY P&L (vs HODL) ===`);
  // Note: current total value INCLUDES whatever capital they had — we have no on-chain visibility of the *initial* deposit amount. We're using user-provided $10k baseline.
  const gasCost = totalGasEth * W_NOW;
  console.log(`  Strategy current total value: $${currentTotal.toFixed(2)}`);
  console.log(`  Gas paid (already in net):    ${totalGasEth.toFixed(6)} ETH = $${gasCost.toFixed(2)}`);
  console.log(`  HODL value:                   $${hodlValue.toFixed(2)}`);
  console.log(`  Δ vs HODL:                    $${(currentTotal-hodlValue).toFixed(2)} (${((currentTotal/hodlValue-1)*100).toFixed(2)}%)`);
}
main().catch(e=>{console.error(e); process.exit(1);});
