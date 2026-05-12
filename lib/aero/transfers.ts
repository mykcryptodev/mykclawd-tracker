// Incremental fetch of ERC-20 Transfer events involving the monitored address.
// On second-and-later runs only the unseen tail is fetched (delta sync).

import { Insight, createThirdwebClient, prepareEvent } from "thirdweb";
import { base as twBase } from "thirdweb/chains";
import { changedRows, db } from "../../db/client";
import { aeroTransfers, aeroConfig } from "../../db/schema";
import { eq } from "drizzle-orm";
import { AERO_AERO, AERO_SYMBOLS } from "./constants";
import { DiscoveredPosition } from "./discover";
import { CdpSqlError, cdpQuery, parseSqlTimestamp, sqlDateTimeFromUnix, sqlString } from "../cdp-sql";

interface InsightLog {
  block_number: number;
  block_timestamp: number;
  transaction_hash: string;
  log_index: number;
  topics: string[];
  data: string;
}

const ERC20_TRANSFER = prepareEvent({
  signature: "event Transfer(address indexed from, address indexed to, uint256 value)",
});

function getClient() {
  const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required");
  return createThirdwebClient({ clientId });
}

function lastSyncedKey(address: string): string {
  return `aero_last_block_${address.toLowerCase()}`;
}

async function readLastSyncedBlock(address: string): Promise<number> {
  const row = await db.select().from(aeroConfig).where(eq(aeroConfig.key, lastSyncedKey(address))).get();
  return row ? Number(row.value) : 0;
}

async function writeLastSyncedBlock(address: string, blockNumber: number) {
  await db.insert(aeroConfig)
    .values({ key: lastSyncedKey(address), value: blockNumber.toString() })
    .onConflictDoUpdate({ target: aeroConfig.key, set: { value: blockNumber.toString() } })
    .run();
}

async function scanOne(
  tw: ReturnType<typeof createThirdwebClient>,
  contractAddress: string,
  filterKey: "filter_topic_1" | "filter_topic_2",
  addrPadded: string,
  fromBlock: number,
  sinceTs: number,
): Promise<InsightLog[]> {
  const out: InsightLog[] = [];
  let page = 0;
  while (true) {
    const events = (await Insight.getContractEvents({
      client: tw, chains: [twBase],
      contractAddress: contractAddress as `0x${string}`,
      event: ERC20_TRANSFER, decodeLogs: false,
      queryOptions: {
        filter_block_timestamp_gte: sinceTs,
        filter_block_number_gte: fromBlock > 0 ? fromBlock : undefined,
        [filterKey]: addrPadded,
        sort_by: "block_number", sort_order: "asc",
        limit: 500, page,
      },
    } as Parameters<typeof Insight.getContractEvents>[0])) as unknown as InsightLog[];
    if (!events.length) break;
    out.push(...events);
    if (events.length < 500) break;
    page++;
  }
  return out;
}

interface CdpAeroLog {
  block_number?: unknown;
  block_timestamp?: unknown;
  transaction_hash?: unknown;
  log_index?: unknown;
  address?: unknown;
  parameters?: { from?: string; to?: string; value?: string };
}

function isCdpAeroLog(event: InsightLog | CdpAeroLog): event is CdpAeroLog {
  return "parameters" in event;
}

async function scanOneSql(
  contractAddress: string,
  dir: "in" | "out",
  address: string,
  fromBlock: number,
  sinceTs: number,
): Promise<CdpAeroLog[] | null> {
  const out: CdpAeroLog[] = [];
  const param = dir === "in" ? "to" : "from";
  let offset = 0;

  try {
    while (true) {
      const rows = (await cdpQuery(`
        SELECT block_number, block_timestamp, transaction_hash, log_index, address, parameters
        FROM base.events
        WHERE address = ${sqlString(contractAddress.toLowerCase())}
          AND event_signature = 'Transfer(address,address,uint256)'
          AND parameters[${sqlString(param)}] = ${sqlString(address.toLowerCase())}
          AND block_timestamp >= ${sqlDateTimeFromUnix(sinceTs)}
          ${fromBlock > 0 ? `AND block_number >= ${fromBlock}` : ""}
        ORDER BY block_number ASC, log_index ASC
        LIMIT 1000 OFFSET ${offset}
      `)) as CdpAeroLog[];
      out.push(...rows);
      if (rows.length < 1000) break;
      offset += rows.length;
    }
    return out;
  } catch (e) {
    if (e instanceof CdpSqlError) return null;
    throw e;
  }
}

export interface IngestTransfersResult {
  newRows: number;
  fromBlock: number;
  toBlock: number;
}

export async function ingestAeroTransfers(
  pos: DiscoveredPosition,
  daysBack: number,
): Promise<IngestTransfersResult> {
  let tw: ReturnType<typeof createThirdwebClient> | null = null;
  const ADDR_PADDED = "0x000000000000000000000000" + pos.address.slice(2);
  const lastBlock = await readLastSyncedBlock(pos.address);
  // Always look back at least daysBack on a cold start; on incremental runs
  // we only need events after the last synced block (overlap by a small buffer
  // to be safe).
  const sinceTs = Math.floor(Date.now() / 1000) - daysBack * 86400;
  const fromBlock = lastBlock > 0 ? Math.max(lastBlock - 50, 0) : 0;

  const tokensToScan = [
    { addr: pos.token0, meta: pos.tokenMeta0 },
    { addr: pos.token1, meta: pos.tokenMeta1 },
    { addr: AERO_AERO, meta: AERO_SYMBOLS[AERO_AERO] },
  ];

  let newRows = 0;
  let maxBlockSeen = lastBlock;

  for (const { addr, meta } of tokensToScan) {
    for (const dir of ["in", "out"] as const) {
      const sqlEvents = await scanOneSql(addr, dir, pos.address, fromBlock, sinceTs);
      const events = sqlEvents ?? await (async () => {
        tw ??= getClient();
        const filterKey: "filter_topic_1" | "filter_topic_2" =
          dir === "in" ? "filter_topic_2" : "filter_topic_1";
        return scanOne(tw, addr, filterKey, ADDR_PADDED, fromBlock, sinceTs);
      })();
      for (const e of events) {
        const isSqlEvent = isCdpAeroLog(e);
        const from = isSqlEvent
          ? (e.parameters?.from ?? "").toLowerCase()
          : "0x" + e.topics[1].slice(26);
        const to = isSqlEvent
          ? (e.parameters?.to ?? "").toLowerCase()
          : "0x" + e.topics[2].slice(26);
        const rawAmount = isSqlEvent
          ? (e.parameters?.value ?? "0").toString()
          : BigInt(e.data).toString();
        const blockTimestamp = isSqlEvent
          ? parseSqlTimestamp(e.block_timestamp as string | number)
          : e.block_timestamp;
        const counterparty = dir === "in" ? from : to;
        const result = await db.insert(aeroTransfers).values({
          txHash: e.transaction_hash as string,
          logIndex: Number(e.log_index),
          blockNumber: Number(e.block_number),
          blockTimestamp,
          tokenAddress: addr.toLowerCase(),
          symbol: meta.sym,
          decimals: meta.dec,
          direction: dir,
          counterparty,
          rawAmount,
        }).onConflictDoNothing().run();
        if (changedRows(result) > 0) newRows++;
        if (Number(e.block_number) > maxBlockSeen) maxBlockSeen = Number(e.block_number);
      }
    }
  }

  if (maxBlockSeen > lastBlock) await writeLastSyncedBlock(pos.address, maxBlockSeen);

  return { newRows, fromBlock, toBlock: maxBlockSeen };
}
