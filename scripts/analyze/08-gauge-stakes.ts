import "dotenv/config";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const rpc = createPublicClient({ chain: base, transport: http(process.env.COINBASE_RPC_URL!) });

const ADDR = "0xf142022273602c6a6c0ea7a044d21082273bd686";
const NPM = "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53";
const GAUGE = "0x61E0B10423a0009C3f83ab4313813d29437d0817";
const POOL  = "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b";

const gaugeAbi = parseAbi([
  "function stakedLength(address depositor) view returns (uint256)",
  "function stakedByIndex(address depositor, uint256 index) view returns (uint256)",
  "function stakedValues(address depositor) view returns (uint256[])",
  "function rewards(uint256 tokenId) view returns (uint256)",
  "function earned(address account, uint256 tokenId) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function rewardRateByEpoch(uint256) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

const positionsAbi = parseAbi([
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function ownerOf(uint256) view returns (address)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function liquidity() view returns (uint128)",
]);

async function main() {
  console.log("Gauge state for Safe:");
  try {
    const len = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "stakedLength", args: [ADDR as `0x${string}`] });
    console.log(`  stakedLength = ${len}`);
    const vals = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "stakedValues", args: [ADDR as `0x${string}`] }) as bigint[];
    console.log(`  stakedValues = [${vals.map(v=>v.toString()).join(", ")}]`);

    // For each staked tokenId, query position
    const slot0 = await rpc.readContract({ address: POOL as `0x${string}`, abi: poolAbi, functionName: "slot0" }) as any;
    const currentTick = Number(slot0[1]);
    const sqrtP = slot0[0] as bigint;
    console.log(`\nPool state: currentTick=${currentTick} sqrtPriceX96=${sqrtP}`);

    let totalAERO = 0n;
    for (const tokenId of vals) {
      const pos: any = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "positions", args: [tokenId] });
      const owner = await rpc.readContract({ address: NPM as `0x${string}`, abi: positionsAbi, functionName: "ownerOf", args: [tokenId] });
      const earned = await rpc.readContract({ address: GAUGE as `0x${string}`, abi: gaugeAbi, functionName: "earned", args: [ADDR as `0x${string}`, tokenId] }) as bigint;
      console.log(`\n  tokenId=${tokenId}`);
      console.log(`    owner=${owner}`);
      console.log(`    token0=${pos[2]} token1=${pos[3]}`);
      console.log(`    tickSpacing=${pos[4]} tickLower=${pos[5]} tickUpper=${pos[6]}`);
      console.log(`    liquidity=${pos[7]}`);
      console.log(`    tokensOwed0=${pos[10]}  tokensOwed1=${pos[11]}`);
      console.log(`    earned (pending AERO) = ${earned} = ${(Number(earned)/1e18).toFixed(6)} AERO`);
      totalAERO += earned;

      // Compute amount0/amount1 given current price using Uniswap V3 math
      // tickLower/tickUpper -> sqrtPriceLow/High
      const tickToSqrt = (t: number) => {
        // sqrt(1.0001^t) * 2^96 = 1.0001^(t/2) * 2^96
        return BigInt(Math.floor(Math.pow(1.0001, t/2) * 2 ** 96));
      };
      const sqrtL = tickToSqrt(Number(pos[5]));
      const sqrtU = tickToSqrt(Number(pos[6]));
      const L = BigInt(pos[7]);

      let a0 = 0n, a1 = 0n;
      const Q96 = 2n ** 96n;
      if (Number(sqrtP) <= Number(sqrtL)) {
        // all token0
        a0 = (L * Q96 * (sqrtU - sqrtL)) / (sqrtU * sqrtL);
      } else if (Number(sqrtP) >= Number(sqrtU)) {
        // all token1
        a1 = (L * (sqrtU - sqrtL)) / Q96;
      } else {
        a0 = (L * Q96 * (sqrtU - sqrtP)) / (sqrtU * sqrtP);
        a1 = (L * (sqrtP - sqrtL)) / Q96;
      }
      console.log(`    position contains: ${(Number(a0)/1e18).toFixed(8)} WETH + ${(Number(a1)/1e8).toFixed(8)} cbBTC (raw a0=${a0} a1=${a1})`);
    }
    console.log(`\nTotal pending AERO = ${(Number(totalAERO)/1e18).toFixed(6)}`);
  } catch (e) { console.log("err:", (e as Error).message.slice(0,300)); }
}
main().catch(e=>{console.error(e); process.exit(1);});
