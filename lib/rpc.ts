import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";

// ThirdWeb RPC for fallback getLogs calls (1000 block range limit).
const BASE_RPC_URL =
  process.env.BASE_RPC_URL ??
  process.env.THIRDWEB_RPC_URL ??
  "https://mainnet.base.org";

export const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

export const TRANSFER_SIG = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;

export interface TransferLog {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  tokenAddress: string;
  from: string;
  to: string;
  value: bigint;
}

// Fetch ERC-20 Transfer logs in a block range where address is sender or receiver.
// Two separate queries because getLogs only supports one indexed topic filter at a time.
export async function getTransferLogs(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<TransferLog[]> {
  const [inbound, outbound] = await Promise.all([
    publicClient.getLogs({
      event: TRANSFER_SIG,
      args: { to: address },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      event: TRANSFER_SIG,
      args: { from: address },
      fromBlock,
      toBlock,
    }),
  ]);

  const seen = new Set<string>();
  const all = [...inbound, ...outbound];
  const result: TransferLog[] = [];

  for (const log of all) {
    const key = `${log.transactionHash}-${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!log.args.from || !log.args.to || log.args.value === undefined) continue;
    result.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex!,
      blockNumber: log.blockNumber!,
      tokenAddress: log.address.toLowerCase(),
      from: log.args.from.toLowerCase(),
      to: log.args.to.toLowerCase(),
      value: log.args.value,
    });
  }

  return result;
}

// Fetch native ETH transfers where address is sender or receiver.
export interface WethEvent {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  type: "deposit" | "withdrawal";
  amount: bigint;
}

// Fetch WETH Deposit(dst, wad) and Withdrawal(src, wad) events for an address.
// WETH deposit/withdraw do NOT emit Transfer events — only these custom events.
export async function getWethEvents(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<WethEvent[]> {
  const depositEvent = parseAbiItem("event Deposit(address indexed dst, uint256 wad)");
  const withdrawalEvent = parseAbiItem("event Withdrawal(address indexed src, uint256 wad)");

  const [deposits, withdrawals] = await Promise.all([
    publicClient.getLogs({
      address: WETH_ADDRESS,
      event: depositEvent,
      args: { dst: address },
      fromBlock,
      toBlock,
    }),
    publicClient.getLogs({
      address: WETH_ADDRESS,
      event: withdrawalEvent,
      args: { src: address },
      fromBlock,
      toBlock,
    }),
  ]);

  const result: WethEvent[] = [];
  for (const log of deposits) {
    if (!log.args.wad) continue;
    result.push({ txHash: log.transactionHash!, logIndex: log.logIndex!, blockNumber: log.blockNumber!, type: "deposit", amount: log.args.wad });
  }
  for (const log of withdrawals) {
    if (!log.args.wad) continue;
    result.push({ txHash: log.transactionHash!, logIndex: log.logIndex!, blockNumber: log.blockNumber!, type: "withdrawal", amount: log.args.wad });
  }
  return result;
}

export async function getNativeTransfers(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<
  Array<{
    txHash: string;
    blockNumber: bigint;
    from: string;
    to: string;
    value: bigint;
    gas: bigint;
    gasPrice: bigint;
  }>
> {
  // Scan all transactions and filter — expensive for public RPC, so only call for owned txs
  // We do this by requesting receipts for each block (too slow for a year).
  // Instead, use getBlock with transactions=true in the block range.
  // For a year of Base blocks this is 15M+ blocks — not feasible.
  // Instead: after we have tx hashes from ERC-20 logs, check their value for ETH too.
  // Return empty — native ETH moves will be caught via the tx hash inspection post-getLogs.
  return [];
}

export async function getTransaction(txHash: `0x${string}`) {
  return publicClient.getTransaction({ hash: txHash });
}

export async function getBlock(blockNumber: bigint) {
  return publicClient.getBlock({ blockNumber });
}

export async function getCurrentBlock(): Promise<bigint> {
  const block = await publicClient.getBlockNumber();
  return block;
}
