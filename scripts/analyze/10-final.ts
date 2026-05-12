// Final PnL analysis with cbBTC=BTC proxy, real starting balance, full gas
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });
const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const WETH  = "0x4200000000000000000000000000000000000006";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const AERO  = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
const NPM   = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const GAUGE = "0x61E0B10423a0009C3f83ab4313813d29437d0817";
const POOL  = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";

const balanceOfAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
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

async function priceCoinGecko(coinId: string): Promise<{ now: number; series: Array<[number,number]> }> {
  const key = process.env.CG_DEMO_KEY;
  const headers: Record<string,string> = { accept: "application/json" };
  if (key) headers["x-cg-demo-api-key"] = key;
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=14&interval=hourly`;
  const res = await fetch(url, { headers });
  const j: any = await res.json();
  const series: Array<[number,number]> = (j.prices || []).map(([ms,p]:[number,number])=>[Math.floor(ms/1000), p]);
  return { now: series[series.length-1]?.[1] ?? 0, series };
}

function priceAt(series: Array<[number,number]>, ts: number): number {
  if (!series.length) return 0;
  let best = series[0];
  for (const p of series) if (Math.abs(p[0]-ts) < Math.abs(best[0]-ts)) best = p;
  return best[1];
}

async function balanceAtBlock(token: string, blockNumber: bigint): Promise<bigint> {
  return await rpc.readContract({
    address: token as `0x${string}`, abi: balanceOfAbi,
    functionName: "balanceOf", args: [ADDR as `0x${string}`],
    blockNumber,
  }) as bigint;
}

async function main() {
  const data = JSON.parse(readFileSync("data/aero-analysis.json","utf-8")) as { since:number; rows: Row[]; txs: any[] };
  const sorted = [...data.rows].sort((a,b)=>a.ts-b.ts);
  const firstBlock = BigInt(sorted[0].block);
  const firstTs = sorted[0].ts;
  const lastTs  = sorted[sorted.length-1].ts;

  console.log(`Activity window: ${new Date(firstTs*1000).toISOString()} → ${new Date(lastTs*1000).toISOString()} (${((lastTs-firstTs)/86400).toFixed(2)} days)`);
  console.log(`First activity block: ${firstBlock}\n`);

  // ===== STARTING BALANCES (block just before first activity) =====
  const beforeBlock = firstBlock - 1n;
  const ethStart = await rpc.getBalance({ address: ADDR as `0x${string}`, blockNumber: beforeBlock });
  const wethStart = await balanceAtBlock(WETH, beforeBlock);
  const cbbtcStart = await balanceAtBlock(CBBTC, beforeBlock);
  const aeroStart = await balanceAtBlock(AERO, beforeBlock);
  console.log("=== STARTING BALANCES (just before first activity) ===");
  console.log(`  ETH:   ${(Number(ethStart)/1e18).toFixed(8)}`);
  console.log(`  WETH:  ${(Number(wethStart)/1e18).toFixed(8)}`);
  console.log(`  cbBTC: ${(Number(cbbtcStart)/1e8).toFixed(8)}`);
  console.log(`  AERO:  ${(Number(aeroStart)/1e18).toFixed(6)}`);

  // ===== CURRENT BALANCES =====
  const ethNow = await rpc.getBalance({ address: ADDR as `0x${string}` });
  const wethNow = await balanceAtBlock(WETH, await rpc.getBlockNumber());
  const cbbtcNow = await balanceAtBlock(CBBTC, await rpc.getBlockNumber());
  const aeroNow = await balanceAtBlock(AERO, await rpc.getBlockNumber());

  // ===== CURRENT LP POSITION =====
  const stakedIds = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "stakedValues", args: [ADDR as `0x${string}`] }) as bigint[];
  const slot0: any = await rpc.readContract({ address: POOL as `0x${string}`, abi: poolAbi, functionName: "slot0" });
  const sqrtP = slot0[0] as bigint;
  let posWETH = 0n, posCBBTC = 0n, pendAERO = 0n;
  const positions: any[] = [];
  for (const tid of stakedIds) {
    const pos: any = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "positions", args: [tid] });
    const earned = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "earned", args: [ADDR as `0x${string}`, tid] }) as bigint;
    pendAERO += earned;
    const tickToSqrt = (t:number) => BigInt(Math.floor(Math.pow(1.0001, t/2) * 2**96));
    const sqrtL = tickToSqrt(Number(pos[5]));
    const sqrtU = tickToSqrt(Number(pos[6]));
    const L = BigInt(pos[7]);
    const Q96 = 2n**96n;
    let a0=0n,a1=0n;
    if (sqrtP <= sqrtL) a0 = (L * Q96 * (sqrtU - sqrtL)) / (sqrtU * sqrtL);
    else if (sqrtP >= sqrtU) a1 = (L * (sqrtU - sqrtL)) / Q96;
    else { a0 = (L * Q96 * (sqrtU - sqrtP)) / (sqrtU * sqrtP); a1 = (L * (sqrtP - sqrtL)) / Q96; }
    a0 += BigInt(pos[10]); a1 += BigInt(pos[11]);
    posWETH += a0; posCBBTC += a1;
    positions.push({ tokenId: tid.toString(), tickLower: pos[5], tickUpper: pos[6], liquidity: pos[7].toString(), a0: a0.toString(), a1: a1.toString(), earned: earned.toString() });
  }

  console.log(`\n=== CURRENT WALLET BALANCES ===`);
  console.log(`  ETH:   ${(Number(ethNow)/1e18).toFixed(8)}`);
  console.log(`  WETH:  ${(Number(wethNow)/1e18).toFixed(8)}`);
  console.log(`  cbBTC: ${(Number(cbbtcNow)/1e8).toFixed(8)}`);
  console.log(`  AERO:  ${(Number(aeroNow)/1e18).toFixed(6)}`);
  console.log(`\n=== CURRENT LP POSITION (token 364941) ===`);
  for (const p of positions) {
    console.log(`  range: [${p.tickLower}, ${p.tickUpper}]  liquidity: ${p.liquidity}`);
    console.log(`  contains: ${(Number(BigInt(p.a0))/1e18).toFixed(8)} WETH + ${(Number(BigInt(p.a1))/1e8).toFixed(8)} cbBTC`);
    console.log(`  pending AERO: ${(Number(BigInt(p.earned))/1e18).toFixed(6)}`);
  }

  // ===== PRICES via CoinGecko =====
  console.log(`\n=== PRICES (CoinGecko, hourly) ===`);
  const eth = await priceCoinGecko("ethereum");
  const btc = await priceCoinGecko("bitcoin"); // cbBTC ≈ BTC
  const aero = await priceCoinGecko("aerodrome-finance");
  const W_NOW = eth.now, C_NOW = btc.now, A_NOW = aero.now;
  const W_START = priceAt(eth.series, firstTs);
  const C_START = priceAt(btc.series, firstTs);
  const A_START = priceAt(aero.series, firstTs);
  console.log(`  ETH/WETH: start=$${W_START.toFixed(2)}  now=$${W_NOW.toFixed(2)}  Δ=${((W_NOW/W_START-1)*100).toFixed(2)}%`);
  console.log(`  BTC/cbBTC: start=$${C_START.toFixed(2)}  now=$${C_NOW.toFixed(2)}  Δ=${((C_NOW/C_START-1)*100).toFixed(2)}%`);
  console.log(`  AERO: start=$${A_START.toFixed(4)}  now=$${A_NOW.toFixed(4)}  Δ=${((A_NOW/A_START-1)*100).toFixed(2)}%`);

  // ===== GAS COSTS =====
  console.log(`\n=== GAS COSTS ===`);
  const uniqHashes = new Set(data.rows.map(r=>r.tx));
  let totalGasWei = 0n; let counted = 0;
  for (const h of uniqHashes) {
    try {
      const r = await rpc.getTransactionReceipt({ hash: h as `0x${string}` });
      if (r.status !== "success") continue;
      const wei = r.gasUsed * r.effectiveGasPrice;
      totalGasWei += wei;
      counted++;
    } catch {}
  }
  const totalGasEth = Number(totalGasWei) / 1e18;
  const totalGasUsd = totalGasEth * W_NOW;
  console.log(`  ${counted} txs, total gas: ${totalGasEth.toFixed(8)} ETH ($${totalGasUsd.toFixed(2)})`);

  // ===== STARTING & ENDING USD VALUES =====
  const startUsd = (Number(ethStart)/1e18)*W_START + (Number(wethStart)/1e18)*W_START + (Number(cbbtcStart)/1e8)*C_START + (Number(aeroStart)/1e18)*A_START;
  console.log(`\n=== USD VALUES ===`);
  console.log(`  STARTING (just before strat began):`);
  const eS = (Number(ethStart)/1e18)*W_START;
  const wS = (Number(wethStart)/1e18)*W_START;
  const cS = (Number(cbbtcStart)/1e8)*C_START;
  const aS = (Number(aeroStart)/1e18)*A_START;
  console.log(`    ETH    $${eS.toFixed(2)}`);
  console.log(`    WETH   $${wS.toFixed(2)}`);
  console.log(`    cbBTC  $${cS.toFixed(2)}`);
  console.log(`    AERO   $${aS.toFixed(2)}`);
  console.log(`    TOTAL  $${startUsd.toFixed(2)}`);

  const posWETHnum = Number(posWETH)/1e18;
  const posCBBTCnum = Number(posCBBTC)/1e8;
  const wethNowNum = Number(wethNow)/1e18;
  const cbbtcNowNum = Number(cbbtcNow)/1e8;
  const ethNowNum = Number(ethNow)/1e18;
  const aeroNowNum = Number(aeroNow)/1e18;
  const pendAEROnum = Number(pendAERO)/1e18;

  const eN = ethNowNum * W_NOW;
  const wN = wethNowNum * W_NOW;
  const cN = cbbtcNowNum * C_NOW;
  const aN = aeroNowNum * A_NOW;
  const posWusd = posWETHnum * W_NOW;
  const posCusd = posCBBTCnum * C_NOW;
  const pendAusd = pendAEROnum * A_NOW;
  console.log(`  ENDING (now):`);
  console.log(`    Wallet ETH    ${ethNowNum.toFixed(6)}  $${eN.toFixed(2)}`);
  console.log(`    Wallet WETH   ${wethNowNum.toFixed(6)}  $${wN.toFixed(2)}`);
  console.log(`    Wallet cbBTC  ${cbbtcNowNum.toFixed(6)}  $${cN.toFixed(2)}`);
  console.log(`    Wallet AERO   ${aeroNowNum.toFixed(2)}  $${aN.toFixed(2)}`);
  console.log(`    Position WETH ${posWETHnum.toFixed(6)}  $${posWusd.toFixed(2)}`);
  console.log(`    Position cbBTC ${posCBBTCnum.toFixed(6)}  $${posCusd.toFixed(2)}`);
  console.log(`    Pending AERO  ${pendAEROnum.toFixed(2)}  $${pendAusd.toFixed(2)}`);
  const endUsd = eN + wN + cN + aN + posWusd + posCusd + pendAusd;
  console.log(`    TOTAL         $${endUsd.toFixed(2)}`);

  // ===== HODL BASELINE =====
  const ethTokens = Number(ethStart)/1e18 + Number(wethStart)/1e18;
  const cbbtcTokens = Number(cbbtcStart)/1e8;
  const aeroTokens = Number(aeroStart)/1e18;
  const hodlUsd = ethTokens*W_NOW + cbbtcTokens*C_NOW + aeroTokens*A_NOW;
  console.log(`\n=== HODL BASELINE (same starting tokens at current prices) ===`);
  console.log(`  ${ethTokens.toFixed(6)} ETH/WETH @ $${W_NOW.toFixed(2)} = $${(ethTokens*W_NOW).toFixed(2)}`);
  console.log(`  ${cbbtcTokens.toFixed(6)} cbBTC @ $${C_NOW.toFixed(2)} = $${(cbbtcTokens*C_NOW).toFixed(2)}`);
  console.log(`  ${aeroTokens.toFixed(2)} AERO @ $${A_NOW.toFixed(4)} = $${(aeroTokens*A_NOW).toFixed(2)}`);
  console.log(`  TOTAL HODL: $${hodlUsd.toFixed(2)}`);

  console.log(`\n=== VERDICT ===`);
  console.log(`  Strategy ending value:   $${endUsd.toFixed(2)}`);
  console.log(`  HODL ending value:       $${hodlUsd.toFixed(2)}`);
  console.log(`  Δ (strategy − HODL):     $${(endUsd-hodlUsd).toFixed(2)}  (${((endUsd/hodlUsd-1)*100).toFixed(3)}%)`);
  console.log(`  Gas paid (external):     $${totalGasUsd.toFixed(2)}`);
  console.log(`  Net Δ after gas:         $${(endUsd-hodlUsd-totalGasUsd).toFixed(2)}`);

  // Persist summary
  writeFileSync("data/aero-summary.json", JSON.stringify({
    window: { firstTs, lastTs, days: (lastTs-firstTs)/86400 },
    prices: { W_NOW, C_NOW, A_NOW, W_START, C_START, A_START },
    start: { eth: Number(ethStart)/1e18, weth: Number(wethStart)/1e18, cbbtc: Number(cbbtcStart)/1e8, aero: Number(aeroStart)/1e18 },
    end: {
      walletEth: ethNowNum, walletWeth: wethNowNum, walletCbbtc: cbbtcNowNum, walletAero: aeroNowNum,
      positionWeth: posWETHnum, positionCbbtc: posCBBTCnum, pendingAero: pendAEROnum,
    },
    usd: { startUsd, endUsd, hodlUsd, totalGasUsd, totalGasEth },
    positions,
    txCount: uniqHashes.size,
    gasTxsCounted: counted,
  }, null, 2));
  console.log(`\n(wrote data/aero-summary.json)`);
}
main().catch(e=>{console.error(e); process.exit(1);});
