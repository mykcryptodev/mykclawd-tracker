import {
  integer,
  real,
  sqliteTable,
  text,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

export const tokens = sqliteTable("tokens", {
  contractAddress: text("contract_address").primaryKey(),
  symbol: text("symbol").notNull().default(""),
  name: text("name").notNull().default(""),
  decimals: integer("decimals").notNull().default(18),
  coingeckoId: text("coingecko_id"),
  isPriced: integer("is_priced", { mode: "boolean" }).notNull().default(false),
  cgChecked: integer("cg_checked", { mode: "boolean" }).notNull().default(false),
  zerionId: text("zerion_id"),
  zerionChecked: integer("zerion_checked", { mode: "boolean" }).notNull().default(false),
  codexChecked: integer("codex_checked", { mode: "boolean" }).notNull().default(false),
  liquidityUsd: real("liquidity_usd"),
});

export const transfers = sqliteTable(
  "transfers",
  {
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull().default(0),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: integer("block_timestamp").notNull(),
    tokenAddress: text("token_address"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    rawAmount: text("raw_amount").notNull(),
    counterparty: text("counterparty"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.txHash, t.logIndex] }),
    tsIdx: index("transfers_ts_idx").on(t.blockTimestamp),
    tokenIdx: index("transfers_token_idx").on(t.tokenAddress),
  })
);

export const transactions = sqliteTable("transactions", {
  txHash: text("tx_hash").primaryKey(),
  blockNumber: integer("block_number").notNull(),
  blockTimestamp: integer("block_timestamp").notNull(),
  gasUsed: text("gas_used").notNull(),
  effectiveGasPrice: text("effective_gas_price").notNull(),
  gasEthWei: text("gas_eth_wei").notNull(),
});

export const prices = sqliteTable(
  "prices",
  {
    tokenAddress: text("token_address").notNull(),
    date: text("date").notNull(),
    priceUsd: real("price_usd").notNull(),
    source: text("source").notNull().default("coingecko"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tokenAddress, t.date] }),
    tokenDateIdx: index("prices_token_date_idx").on(t.tokenAddress, t.date),
  })
);

export const lots = sqliteTable("lots", {
  tokenAddress: text("token_address").primaryKey(),
  quantity: text("quantity").notNull().default("0"),
  avgCostUsd: real("avg_cost_usd").notNull().default(0),
  realizedPnlUsd: real("realized_pnl_usd").notNull().default(0),
});

export const dailySnapshots = sqliteTable("daily_snapshots", {
  date: text("date").primaryKey(),
  totalValueUsd: real("total_value_usd").notNull(),
  totalCostBasisUsd: real("total_cost_basis_usd").notNull(),
  unrealizedPnlUsd: real("unrealized_pnl_usd").notNull(),
  realizedPnlUsdCum: real("realized_pnl_usd_cum").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
