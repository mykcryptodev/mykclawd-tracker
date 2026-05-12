// Discover the address's active Aerodrome CL gauge/pool by looking at recent AERO inflows.
// Returns null if the address has no active staked position.

import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { Insight, createThirdwebClient, prepareEvent } from "thirdweb";
import { base as twBase } from "thirdweb/chains";
import { AERO_AERO, AERO_SYMBOLS, TokenMeta } from "./constants";
import { CdpSqlError, cdpQuery, sqlDateTimeFromUnix, sqlString } from "../cdp-sql";

const rpc = createPublicClient({
  chain: base,
  transport: http(process.env.COINBASE_RPC_URL ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

const gaugeAbi = parseAbi([
  "function pool() view returns (address)",
  "function rewardToken() view returns (address)",
  "function stakedValues(address) view returns (uint256[])",
]);
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const ERC20_TRANSFER = prepareEvent({
  signature: "event Transfer(address indexed from, address indexed to, uint256 value)",
});

export interface DiscoveredPosition {
  address: string;
  gauge: string;
  pool: string;
  token0: string;
  token1: string;
  tokenMeta0: TokenMeta;
  tokenMeta1: TokenMeta;
  stakedTokenIds: bigint[];
}

// Pull the token metadata for an arbitrary ERC-20 if we don't already know it.
async function fetchTokenMeta(addr: string): Promise<TokenMeta> {
  const known = AERO_SYMBOLS[addr.toLowerCase()];
  if (known) return known;
  const [sym, dec] = await Promise.all([
    rpc.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
    rpc.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
  ]);
  return { addr: addr.toLowerCase(), sym, dec: Number(dec) };
}

interface InsightLog {
  block_number: number;
  block_timestamp: number;
  transaction_hash: string;
  log_index: number;
  topics: string[];
  data: string;
}

async function fetchAeroRewardSendersSql(address: string, sinceTs: number): Promise<Set<string> | null> {
  const senders = new Set<string>();
  let offset = 0;

  try {
    while (true) {
      const rows = await cdpQuery(`
        SELECT parameters
        FROM base.events
        WHERE address = ${sqlString(AERO_AERO)}
          AND event_signature = 'Transfer(address,address,uint256)'
          AND parameters['to'] = ${sqlString(address.toLowerCase())}
          AND block_timestamp >= ${sqlDateTimeFromUnix(sinceTs)}
        ORDER BY block_number DESC, log_index DESC
        LIMIT 1000 OFFSET ${offset}
      `);
      for (const row of rows) {
        const params = row.parameters as { from?: string };
        if (params?.from) senders.add(params.from.toLowerCase());
      }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
    return senders;
  } catch (e) {
    if (e instanceof CdpSqlError) return null;
    throw e;
  }
}

export async function discoverAeroPosition(address: string, daysBack = 14): Promise<DiscoveredPosition | null> {
  const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required");

  const ADDR_PADDED = "0x000000000000000000000000" + address.toLowerCase().slice(2);
  const sinceTs = Math.floor(Date.now() / 1000) - daysBack * 86400;

  // AERO senders (i.e. gauges that paid this address)
  const senders = await fetchAeroRewardSendersSql(address, sinceTs) ?? await (async () => {
    const tw = createThirdwebClient({ clientId });
    const fallbackSenders = new Set<string>();
    let page = 0;
    while (true) {
      const events = (await Insight.getContractEvents({
        client: tw, chains: [twBase],
        contractAddress: AERO_AERO as `0x${string}`,
        event: ERC20_TRANSFER, decodeLogs: false,
        queryOptions: {
          filter_block_timestamp_gte: sinceTs,
          filter_topic_2: ADDR_PADDED,
          sort_by: "block_number", sort_order: "desc",
          limit: 500, page,
        },
      } as Parameters<typeof Insight.getContractEvents>[0])) as unknown as InsightLog[];
      if (!events.length) break;
      for (const e of events) fallbackSenders.add(("0x" + e.topics[1].slice(26)).toLowerCase());
      if (events.length < 500) break;
      page++;
    }
    return fallbackSenders;
  })();

  // Probe each AERO sender — pick the first one whose rewardToken==AERO and stakedValues(address) is non-empty.
  for (const g of senders) {
    try {
      const reward = await rpc.readContract({ address: g as `0x${string}`, abi: gaugeAbi, functionName: "rewardToken" }) as string;
      if (reward.toLowerCase() !== AERO_AERO) continue;
      const pool = (await rpc.readContract({ address: g as `0x${string}`, abi: gaugeAbi, functionName: "pool" }) as string).toLowerCase();
      const staked = await rpc.readContract({
        address: g as `0x${string}`, abi: gaugeAbi, functionName: "stakedValues",
        args: [address as `0x${string}`],
      }) as bigint[];
      if (staked.length === 0) continue;
      const [t0, t1] = await Promise.all([
        rpc.readContract({ address: pool as `0x${string}`, abi: poolAbi, functionName: "token0" }) as Promise<string>,
        rpc.readContract({ address: pool as `0x${string}`, abi: poolAbi, functionName: "token1" }) as Promise<string>,
      ]);
      const [m0, m1] = await Promise.all([fetchTokenMeta(t0), fetchTokenMeta(t1)]);
      return {
        address: address.toLowerCase(),
        gauge: g.toLowerCase(),
        pool,
        token0: t0.toLowerCase(),
        token1: t1.toLowerCase(),
        tokenMeta0: m0,
        tokenMeta1: m1,
        stakedTokenIds: staked,
      };
    } catch { /* not a CLGauge */ }
  }

  return null;
}
