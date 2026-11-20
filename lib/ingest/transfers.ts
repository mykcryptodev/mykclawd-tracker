import { changedRows, db } from "../../db/client";
import { transfers, syncState, tokens } from "../../db/schema";
import { getTransferLogs, getWethEvents, getCurrentBlock, GETLOGS_MAX_RANGE, NATIVE_TOKEN_ADDRESS, WETH_ADDRESS } from "../rpc";
import { eq } from "drizzle-orm";
import { CdpSqlError, cdpQuery, parseSqlTimestamp, sqlString } from "../cdp-sql";

const SQL_LIMIT = 1000; // target limit per SQL query
const RPC_CHUNK_BLOCKS = GETLOGS_MAX_RANGE;
const SQL_FALLBACK_MIN = 50_000n; // below this, switch straight to RPC

// CDP SQL has returned HTTP 500 for every range since ~Oct 2026. After the
// first failure in a run, skip it: otherwise every chunk burns ~15 failing
// SQL rounds (each with retries) before falling back to RPC.
let sqlDisabled = false;

// Block where the address first appeared — determined from prior exploration
const FIRST_ACTIVE_BLOCK = 41_000_000n;

type RawTransfer = {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: number;
  tokenAddress: string;
  direction: "in" | "out";
  rawAmount: string;
  counterparty: string;
};

function parseSqlRows(rows: Record<string, unknown>[], address: string): RawTransfer[] {
  const out: RawTransfer[] = [];
  const addrLower = address.toLowerCase();
  for (const row of rows) {
    const params = row.parameters as { from?: string; to?: string; value?: string };
    const tokenAddress = (row.address as string).toLowerCase();
    const from = (params.from ?? "").toLowerCase();
    const to = (params.to ?? "").toLowerCase();
    if (from !== addrLower && to !== addrLower) continue;
    const direction: "in" | "out" = to === addrLower ? "in" : "out";
    out.push({
      txHash: row.transaction_hash as string,
      logIndex: row.log_index as number,
      blockNumber: typeof row.block_number === "string"
        ? parseInt(row.block_number) : (row.block_number as number),
      blockTimestamp: parseSqlTimestamp(row.block_timestamp as string),
      tokenAddress,
      direction,
      rawAmount: (params.value ?? "0").toString(),
      counterparty: direction === "in" ? from : to,
    });
  }
  return out;
}

function parseSqlNativeEthRows(rows: Record<string, unknown>[], address: string): RawTransfer[] {
  const addrLower = address.toLowerCase();
  return rows
    .filter((row) => {
      const from = (row.from_address as string ?? "").toLowerCase();
      const to = (row.to_address as string ?? "").toLowerCase();
      return from === addrLower || to === addrLower;
    })
    .map((row) => {
      const from = (row.from_address as string).toLowerCase();
      const to = (row.to_address as string ?? "").toLowerCase();
      const direction: "in" | "out" = to === addrLower ? "in" : "out";
      return {
        txHash: row.transaction_hash as string,
        logIndex: -1,
        blockNumber: typeof row.block_number === "string" ? parseInt(row.block_number) : (row.block_number as number),
        blockTimestamp: parseSqlTimestamp((row.block_timestamp ?? row.timestamp) as string | number),
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        direction,
        rawAmount: (row.value ?? "0").toString(),
        counterparty: direction === "in" ? from : to,
      };
    });
}

function parseSqlWethRows(rows: Record<string, unknown>[]): RawTransfer[] {
  return rows.map((row) => {
    const sig = row.event_signature as string;
    const params = row.parameters as { dst?: string; src?: string; wad?: string };
    const isDeposit = sig.startsWith("Deposit");
    return {
      txHash: row.transaction_hash as string,
      logIndex: row.log_index as number,
      blockNumber: typeof row.block_number === "string"
        ? parseInt(row.block_number) : (row.block_number as number),
      blockTimestamp: parseSqlTimestamp(row.block_timestamp as string),
      tokenAddress: WETH_ADDRESS,
      direction: isDeposit ? "in" : "out",
      rawAmount: (params.wad ?? "0").toString(),
      counterparty: "0x0000000000000000000000000000000000000000",
    };
  });
}

async function fetchSql(
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  limit = SQL_LIMIT
): Promise<RawTransfer[] | null> {
  if (sqlDisabled) return null;
  try {
    const [transferRows, wethRows, nativeEthRows] = await Promise.all([
      cdpQuery(`
        SELECT block_number, log_index, block_timestamp, address, parameters, transaction_hash
        FROM base.events
        WHERE event_signature = 'Transfer(address,address,uint256)'
          AND (parameters['to'] = ${sqlString(address.toLowerCase())}
            OR parameters['from'] = ${sqlString(address.toLowerCase())})
          AND block_number BETWEEN ${fromBlock} AND ${toBlock}
        LIMIT ${limit}
      `),
      cdpQuery(`
        SELECT block_number, log_index, block_timestamp, event_signature, parameters, transaction_hash
        FROM base.events
        WHERE address = ${sqlString(WETH_ADDRESS)}
          AND ((event_signature = 'Deposit(address,uint256)' AND parameters['dst'] = ${sqlString(address.toLowerCase())})
            OR (event_signature = 'Withdrawal(address,uint256)' AND parameters['src'] = ${sqlString(address.toLowerCase())}))
          AND block_number BETWEEN ${fromBlock} AND ${toBlock}
        LIMIT 1000
      `),
      cdpQuery(`
        SELECT transaction_hash, block_number, timestamp, from_address, to_address, value
        FROM base.transactions
        WHERE (from_address = ${sqlString(address.toLowerCase())} OR to_address = ${sqlString(address.toLowerCase())})
          AND CAST(value AS NUMERIC) > 0
          AND block_number BETWEEN ${fromBlock} AND ${toBlock}
        LIMIT 2000
      `).catch(() => [] as Record<string, unknown>[]),
    ]);
    return [...parseSqlRows(transferRows, address), ...parseSqlWethRows(wethRows), ...parseSqlNativeEthRows(nativeEthRows, address)];
  } catch (e) {
    if (e instanceof CdpSqlError) {
      console.warn(`    SQL failed for ${fromBlock}-${toBlock}: ${e.message} (using RPC for the rest of this run)`);
      sqlDisabled = true;
      return null;
    }
    throw e;
  }
}

async function fetchRpc(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<RawTransfer[]> {
  const out: RawTransfer[] = [];
  const BASE_GENESIS = 1686789347;
  for (let cur = fromBlock; cur <= toBlock; cur += RPC_CHUNK_BLOCKS) {
    const end = cur + RPC_CHUNK_BLOCKS - 1n > toBlock ? toBlock : cur + RPC_CHUNK_BLOCKS - 1n;
    const logs = await getTransferLogs(address, cur, end);
    const wethEvents = await getWethEvents(address, cur, end);
    for (const log of logs) {
      const direction = log.to === address.toLowerCase() ? "in" : "out";
      out.push({
        txHash: log.txHash,
        logIndex: log.logIndex,
        blockNumber: Number(log.blockNumber),
        blockTimestamp: BASE_GENESIS + Number(log.blockNumber) * 2,
        tokenAddress: log.tokenAddress,
        direction,
        rawAmount: log.value.toString(),
        counterparty: direction === "in" ? log.from : log.to,
      });
    }
    for (const ev of wethEvents) {
      out.push({
        txHash: ev.txHash,
        logIndex: ev.logIndex,
        blockNumber: Number(ev.blockNumber),
        blockTimestamp: BASE_GENESIS + Number(ev.blockNumber) * 2,
        tokenAddress: WETH_ADDRESS,
        direction: ev.type === "deposit" ? "in" : "out",
        rawAmount: ev.amount.toString(),
        counterparty: "0x0000000000000000000000000000000000000000",
      });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

// Adaptive recursive fetch: try SQL, fall back to RPC on scan limit.
// If SQL returns exactly LIMIT rows (might have more), splits and recurses.
async function fetchAdaptive(
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0
): Promise<RawTransfer[]> {
  const blockRange = toBlock - fromBlock + 1n;

  // Below the minimum, skip straight to RPC (avoids deep recursion for tiny ranges)
  if (blockRange <= SQL_FALLBACK_MIN || depth >= 5 || sqlDisabled) {
    return fetchRpc(address as `0x${string}`, fromBlock, toBlock);
  }

  const limit = depth === 0 ? SQL_LIMIT : 200; // use smaller limit for sub-chunks
  const rows = await fetchSql(address, fromBlock, toBlock, limit);

  if (rows === null && sqlDisabled) {
    return fetchRpc(address as `0x${string}`, fromBlock, toBlock);
  }

  if (rows === null) {
    // SQL scan limit exceeded — split and recurse
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    // Sequential, not Promise.all: parallel halves fanned out to 16 RPC leaves
    // x 4 getLogs each, which tripped the RPC's 429 rate limit every run.
    const a = await fetchAdaptive(address, fromBlock, mid, depth + 1);
    const b = await fetchAdaptive(address, mid + 1n, toBlock, depth + 1);
    return [...a, ...b];
  }

  if (rows.length === limit) {
    // Hit the limit — might have missed some, split to be sure
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    // Sequential, not Promise.all: parallel halves fanned out to 16 RPC leaves
    // x 4 getLogs each, which tripped the RPC's 429 rate limit every run.
    const a = await fetchAdaptive(address, fromBlock, mid, depth + 1);
    const b = await fetchAdaptive(address, mid + 1n, toBlock, depth + 1);
    return [...a, ...b];
  }

  return rows;
}

async function upsertTransfers(rows: RawTransfer[]): Promise<number> {
  let added = 0;
  for (const t of rows) {
    const tokenExists = await db
      .select()
      .from(tokens)
      .where(eq(tokens.contractAddress, t.tokenAddress))
      .get();
    if (!tokenExists) {
      await db.insert(tokens)
        .values({
          contractAddress: t.tokenAddress,
          symbol: "",
          name: "",
          decimals: 18,
          coingeckoId: null,
          isPriced: false,
        })
        .onConflictDoNothing()
        .run();
    }
    const result = await db
      .insert(transfers)
      .values(t)
      .onConflictDoNothing()
      .run();
    if (changedRows(result) > 0) added++;
  }
  return added;
}

function getSyncKey(address: string) {
  return `last_block_${address.toLowerCase()}`;
}

function getNativeEthSyncKey(address: string) {
  return `last_native_eth_block_${address.toLowerCase()}`;
}

type BasescanTx = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
};

// Incremental backfill for native ETH value transfers.
// Safe to re-run — onConflictDoNothing prevents duplicates.
// Synthesize native ETH "in" transfers from WETH Withdrawal events already in the DB.
// When WETH.withdraw() is called, the WETH contract sends ETH to the caller via an
// internal call — NOT a normal tx value, so it won't be in the Blockscout tx list.
// The Withdrawal event amount is always exactly equal to the ETH received.
export async function synthesizeEthFromWethWithdrawals(): Promise<number> {
  const ZERO = "0x0000000000000000000000000000000000000000";
  // Find all WETH Withdrawal events: WETH "out" transfers with counterparty = zero addr
  const withdrawals = (await db
    .select()
    .from(transfers)
    .where(eq(transfers.tokenAddress, WETH_ADDRESS))
    .all())
    .filter((t) => t.direction === "out" && t.counterparty === ZERO && t.logIndex >= 0);

  let added = 0;
  for (const w of withdrawals) {
    // logIndex for synthetic ETH "in" — must be unique per txHash, must not collide with -1
    const syntheticLogIndex = -(w.logIndex + 100);
    const result = await db
      .insert(transfers)
      .values({
        txHash: w.txHash,
        logIndex: syntheticLogIndex,
        blockNumber: w.blockNumber,
        blockTimestamp: w.blockTimestamp,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        direction: "in",
        rawAmount: w.rawAmount,
        counterparty: WETH_ADDRESS,
      })
      .onConflictDoNothing()
      .run();
    if (changedRows(result) > 0) added++;
  }
  return added;
}

type CdpTrace = { error: string; type: string; from: string; to: string; value: string };
type CdpAddressTx = {
  hash: string;
  blockHeight: string;
  ethereum: { blockTimestamp: string; flattenedTraces?: CdpTrace[] };
};

// Native ETH moves from the CDP node's address index (cdp_listAddressTransactions).
// Unlike a txlist it includes internal calls, e.g. ETH paid out by a router.
// Pages newest-first (25 per page) and stops once it passes fromBlock.
export async function fetchNativeEthCdp(address: string, fromBlock: bigint): Promise<RawTransfer[]> {
  const addr = address.toLowerCase();
  const out: RawTransfer[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  while (true) {
    const res = await fetch(process.env.CDP_RPC_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "cdp_listAddressTransactions",
        params: [{ address: addr, limit: 25, ...(pageToken ? { pageToken } : {}) }],
      }),
    });
    const json = (await res.json()) as {
      result?: { addressTransactions: CdpAddressTx[]; nextPageToken?: string };
      error?: { message: string };
    };
    if (!json.result) throw new Error(`cdp_listAddressTransactions failed: ${json.error?.message ?? res.status}`);
    pages++;

    let passedFrom = false;
    for (const tx of json.result.addressTransactions) {
      if (BigInt(tx.blockHeight) < fromBlock) {
        passedFrom = true;
        continue;
      }
      (tx.ethereum.flattenedTraces ?? []).forEach((tr, i) => {
        const from = tr.from.toLowerCase();
        const to = tr.to.toLowerCase();
        if (tr.error || BigInt(tr.value || "0") === 0n || (from !== addr && to !== addr)) return;
        // WETH unwraps are already synthesized from Withdrawal events.
        if (from === WETH_ADDRESS) return;
        const direction: "in" | "out" = to === addr ? "in" : "out";
        out.push({
          txHash: tx.hash,
          // -1 matches the old txlist rows for the top-level call; internal
          // calls get their own range so they never collide with WETH synth rows.
          logIndex: i === 0 ? -1 : -(10_000 + i),
          blockNumber: Number(tx.blockHeight),
          blockTimestamp: Math.floor(new Date(tx.ethereum.blockTimestamp).getTime() / 1000),
          tokenAddress: NATIVE_TOKEN_ADDRESS,
          direction,
          rawAmount: tr.value,
          counterparty: direction === "in" ? from : to,
        });
      });
    }

    pageToken = json.result.nextPageToken;
    if (passedFrom || !pageToken) break;
    if (pages % 100 === 0) console.log(`  ETH backfill (CDP) ${pages} pages | ${out.length} ETH moves`);
  }
  console.log(`  ETH backfill (CDP): ${pages} pages, ${out.length} ETH moves`);
  return out;
}

export async function ingestNativeEthBackfill(address: string): Promise<number> {
  const syncKey = getNativeEthSyncKey(address);
  const stateRow = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, syncKey))
    .get();

  const fromBlock = stateRow ? BigInt(stateRow.value) + 1n : FIRST_ACTIVE_BLOCK;
  const currentBlock = await getCurrentBlock();
  if (fromBlock > currentBlock) return 0;

  async function markSynced() {
    await db.insert(syncState)
      .values({ key: syncKey, value: currentBlock.toString() })
      .onConflictDoUpdate({
        target: syncState.key,
        set: { value: currentBlock.toString() },
      })
      .run();
  }

  if (process.env.CDP_RPC_URL) {
    try {
      const cdpRows = await fetchNativeEthCdp(address, fromBlock);
      const added = await upsertTransfers(cdpRows);
      await markSynced();
      return added;
    } catch (e) {
      console.warn(`  ETH backfill (CDP) failed, cursor not advanced: ${(e as Error).message}`);
      return 0;
    }
  }

  const sqlRows = await fetchNativeEthSqlAdaptive(address, fromBlock, currentBlock);
  if (sqlRows) {
    const added = await upsertTransfers(sqlRows);
    await markSynced();
    return added;
  }

  // Etherscan-compatible txlist providers, tried in order. Basescan's v1 API is
  // dead, and both of these need a paid plan for Base (chain 8453).
  const providers = [
    process.env.ETHERSCAN_API_KEY &&
      { name: "Etherscan", base: `https://api.etherscan.io/v2/api?chainid=8453&apikey=${process.env.ETHERSCAN_API_KEY}` },
    process.env.BLOCKSCOUT_API_KEY &&
      { name: "Blockscout", base: `https://api.blockscout.com/v2/api?chain_id=8453&apikey=${process.env.BLOCKSCOUT_API_KEY}` },
  ].filter((p): p is { name: string; base: string } => Boolean(p));
  if (providers.length === 0) {
    console.warn("  ETH backfill skipped, cursor not advanced: no ETHERSCAN_API_KEY or BLOCKSCOUT_API_KEY");
    return 0;
  }

  for (const provider of providers) {
    const added = await fetchNativeEthTxlist(provider, address, fromBlock, currentBlock);
    if (added !== null) {
      await markSynced();
      return added;
    }
  }
  return 0;
}

// Returns null when the provider gave no usable answer, so the caller can try
// the next one without advancing the cursor.
async function fetchNativeEthTxlist(
  provider: { name: string; base: string },
  address: string,
  fromBlock: bigint,
  currentBlock: bigint
): Promise<number | null> {
  const addrLower = address.toLowerCase();
  let added = 0;
  let page = 1;

  // Fetch normal txs (direct ETH sends/receives) — paginated 10k at a time
  while (true) {
    const url = `${provider.base}&module=account&action=txlist&address=${address}&startblock=${Number(fromBlock)}&endblock=${Number(currentBlock)}&page=${page}&offset=10000&sort=asc`;
    const res = await fetch(url);
    const body = await res.text();
    let json: { status: string; result: BasescanTx[] | string };
    try {
      json = JSON.parse(body) as { status: string; result: BasescanTx[] | string };
    } catch {
      // Basescan's v1 API now serves an HTML page here. Don't fail the whole
      // sync over it; WETH withdrawals are still synthesized below.
      console.warn(`  ETH backfill via ${provider.name} failed: HTTP ${res.status} non-JSON response`);
      return page === 1 ? null : added;
    }
    if (json.status !== "1" || !Array.isArray(json.result)) {
      // "No transactions found" is a real empty result. Anything else (missing
      // key, deprecated endpoint) means we learned nothing, so keep the cursor
      // where it is instead of marking the range synced with no data.
      if (typeof json.result === "string" && !/no transactions found/i.test(json.result) && page === 1) {
        console.warn(`  ETH backfill via ${provider.name} failed: ${json.result.slice(0, 120)}`);
        return null;
      }
      break;
    }

    const ethTxs: RawTransfer[] = json.result
      .filter((tx) => tx.isError === "0" && BigInt(tx.value || "0") > 0n)
      .map((tx) => {
        const from = tx.from.toLowerCase();
        const to = tx.to.toLowerCase();
        const direction: "in" | "out" = to === addrLower ? "in" : "out";
        return {
          txHash: tx.hash,
          logIndex: -1,
          blockNumber: parseInt(tx.blockNumber),
          blockTimestamp: parseInt(tx.timeStamp),
          tokenAddress: NATIVE_TOKEN_ADDRESS,
          direction,
          rawAmount: tx.value,
          counterparty: direction === "in" ? from : to,
        };
      });

    added += await upsertTransfers(ethTxs);
    console.log(`  ETH backfill page ${page} | ${json.result.length} txs | ${added} new ETH transfers`);

    if (json.result.length < 10000) break;
    page++;
    await new Promise((r) => setTimeout(r, 250));
  }

  return added;
}

async function fetchNativeEthSql(
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  limit = 2000
): Promise<RawTransfer[] | null> {
  try {
    const rows = await cdpQuery(`
      SELECT transaction_hash, block_number, timestamp, from_address, to_address, value
      FROM base.transactions
      WHERE (from_address = ${sqlString(address.toLowerCase())} OR to_address = ${sqlString(address.toLowerCase())})
        AND CAST(value AS NUMERIC) > 0
        AND block_number BETWEEN ${fromBlock} AND ${toBlock}
      LIMIT ${limit}
    `);
    return parseSqlNativeEthRows(rows, address);
  } catch (e) {
    if (e instanceof CdpSqlError) return null;
    throw e;
  }
}

async function fetchNativeEthSqlAdaptive(
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0
): Promise<RawTransfer[] | null> {
  const blockRange = toBlock - fromBlock + 1n;
  if (blockRange <= SQL_FALLBACK_MIN || depth >= 5) {
    return fetchNativeEthSql(address, fromBlock, toBlock, 2000);
  }

  const rows = await fetchNativeEthSql(address, fromBlock, toBlock, 2000);
  if (rows === null) return null;
  if (rows.length < 2000) return rows;

  const mid = fromBlock + (toBlock - fromBlock) / 2n;
  const [a, b] = await Promise.all([
    fetchNativeEthSqlAdaptive(address, fromBlock, mid, depth + 1),
    fetchNativeEthSqlAdaptive(address, mid + 1n, toBlock, depth + 1),
  ]);
  if (a === null || b === null) return null;
  return [...a, ...b];
}

// `deadline` (epoch ms) stops between chunks so a large backlog is worked off
// across several runs instead of the job timing out and losing the chunk.
export async function ingestTransfers(
  address: string,
  deadline = Infinity
): Promise<{ newTransfers: number; blocksScanned: number; blocksRemaining: number }> {
  const syncKey = getSyncKey(address);
  const stateRow = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, syncKey))
    .get();

  const fromBlock = stateRow ? BigInt(stateRow.value) + 1n : FIRST_ACTIVE_BLOCK;
  const toBlock = await getCurrentBlock();

  if (fromBlock > toBlock) return { newTransfers: 0, blocksScanned: 0, blocksRemaining: 0 };

  // Split into 100k block chunks; the cursor is saved after each one. When SQL
  // is down, each chunk is ~100 RPC windows, so a cancelled run loses little.
  const TOP_CHUNK = 100_000n;
  const chunks: Array<[bigint, bigint]> = [];
  for (let cur = fromBlock; cur <= toBlock; cur += TOP_CHUNK) {
    const end = cur + TOP_CHUNK - 1n > toBlock ? toBlock : cur + TOP_CHUNK - 1n;
    chunks.push([cur, end]);
  }

  console.log(`  ${chunks.length} chunks (${fromBlock.toLocaleString()} → ${toBlock.toLocaleString()})`);

  let newTransfers = 0;
  let scannedTo = fromBlock - 1n;

  for (let i = 0; i < chunks.length; i++) {
    if (Date.now() > deadline) {
      console.log(`  Time budget reached after ${i}/${chunks.length} chunks; resuming next run`);
      break;
    }
    const [chunkStart, chunkEnd] = chunks[i];
    const rows = await fetchAdaptive(address, chunkStart, chunkEnd);
    newTransfers += await upsertTransfers(rows);

    await db.insert(syncState)
      .values({ key: syncKey, value: chunkEnd.toString() })
      .onConflictDoUpdate({ target: syncState.key, set: { value: chunkEnd.toString() } })
      .run();

    scannedTo = chunkEnd;

    console.log(`  ${i + 1}/${chunks.length} chunks | ${newTransfers} new transfers`);
  }

  return {
    newTransfers,
    blocksScanned: Number(scannedTo - fromBlock + 1n),
    blocksRemaining: Number(toBlock - scannedTo),
  };
}
