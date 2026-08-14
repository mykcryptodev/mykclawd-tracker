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
  imageUrl: text("image_url"),
  imageChecked: integer("image_checked", { mode: "boolean" }).notNull().default(false),
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
  // Quantity acquired with no traceable cost (airdrops, unpriceable transfers).
  zeroBasisQty: real("zero_basis_qty").notNull().default(0),
  // False when the transfer history does not reach back far enough to cover a
  // disposal — this token's basis is not trustworthy and the UI hides it.
  basisComplete: integer("basis_complete", { mode: "boolean" }).notNull().default(true),
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

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio NAV (Zerion-sourced) — replaces the transfer-replay PnL model
// ─────────────────────────────────────────────────────────────────────────────

// Daily net-asset-value series for the history chart. `source` distinguishes our
// own live snapshots from the Zerion wallet-chart backfill so a
// live point for a given day always wins over a backfilled one.
export const portfolioNav = sqliteTable("portfolio_nav", {
  date: text("date").primaryKey(), // YYYY-MM-DD (UTC)
  valueUsd: real("value_usd").notNull(),
  source: text("source", { enum: ["live", "zerion_history"] })
    .notNull()
    .default("live"),
});

// Current token holdings, fully replaced on every sync (tokens only — no app/NFT).
export const portfolioPositions = sqliteTable("portfolio_positions", {
  tokenAddress: text("token_address").primaryKey(),
  symbol: text("symbol").notNull().default(""),
  name: text("name").notNull().default(""),
  network: text("network").notNull().default("Base"),
  imgUrl: text("img_url"),
  price: real("price"),
  balance: real("balance").notNull().default(0),
  balanceRaw: text("balance_raw").notNull().default("0"),
  balanceUsd: real("balance_usd").notNull().default(0),
  // Zerion PnL — populated during sync
  realizedGain: real("realized_gain"),
  unrealizedGain: real("unrealized_gain"),
  totalGain: real("total_gain"),
  totalGainPct: real("total_gain_pct"),
  realizedGainPct: real("realized_gain_pct"),
  unrealizedGainPct: real("unrealized_gain_pct"),
  totalInvested: real("total_invested"),
  // 24h price change
  change1dUsd: real("change_1d_usd"),
  change1dPct: real("change_1d_pct"),
  updatedAt: integer("updated_at").notNull(), // unix seconds
});

// Single-row (id = 1) sync metadata: when we last pulled from Zerion + headline totals.
// totalUsd / tokenCount include native ETH, matching the Zerion wallet-chart basis.
export const portfolioSync = sqliteTable("portfolio_sync", {
  id: integer("id").primaryKey(), // always 1
  syncedAt: integer("synced_at").notNull(), // unix seconds
  totalUsd: real("total_usd").notNull(), // NAV, includes native ETH
  tokenCount: integer("token_count").notNull(), // includes native ETH
  nativeEthBalance: real("native_eth_balance").notNull().default(0),
  nativeEthUsd: real("native_eth_usd").notNull().default(0),
  error: text("error"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Aerodrome LP rebalance monitor
// ─────────────────────────────────────────────────────────────────────────────

// Cached ERC-20 Transfer events involving the monitored address. Keyed by tx+log
// so re-fetching is idempotent. Only transfers of tokens the strategy cares about
// (token0, token1 of the LP pool, AERO) are kept.
export const aeroTransfers = sqliteTable(
  "aero_transfers",
  {
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: integer("block_timestamp").notNull(),
    tokenAddress: text("token_address").notNull(),
    symbol: text("symbol").notNull(),
    decimals: integer("decimals").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    counterparty: text("counterparty").notNull(),
    rawAmount: text("raw_amount").notNull(),
    walletAddress: text("wallet_address").notNull().default("0xf142022273602c6a6c0ea7a044d21082273bd686"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.txHash, t.logIndex] }),
    tsIdx: index("aero_transfers_ts_idx").on(t.blockTimestamp),
    blockIdx: index("aero_transfers_block_idx").on(t.blockNumber),
    addrIdx: index("aero_transfers_addr_idx").on(t.walletAddress),
  })
);

// Per-tx gas cost (finalized blocks never change → safe to cache forever).
export const aeroGasCache = sqliteTable("aero_gas_cache", {
  txHash: text("tx_hash").primaryKey(),
  gasWei: text("gas_wei").notNull(), // gasUsed * effectiveGasPrice
  blockNumber: integer("block_number").notNull(),
});

// One row per snapshot — appended each time the monitor runs.
export const aeroSnapshots = sqliteTable(
  "aero_snapshots",
  {
    ts: integer("ts").notNull(), // unix seconds when the snapshot was taken
    address: text("address").notNull(),
    pool: text("pool").notNull(),
    gauge: text("gauge").notNull(),
    token0: text("token0").notNull(),
    token1: text("token1").notNull(),
    sym0: text("sym0").notNull(),
    sym1: text("sym1").notNull(),
    dec0: integer("dec0").notNull(),
    dec1: integer("dec1").notNull(),
    firstTs: integer("first_ts").notNull(),
    lastTs: integer("last_ts").notNull(),
    days: real("days").notNull(),

    // Prices used
    p0Now: real("p0_now").notNull(),
    p1Now: real("p1_now").notNull(),
    paNow: real("pa_now").notNull(),
    p0Start: real("p0_start").notNull(),
    p1Start: real("p1_start").notNull(),
    paStart: real("pa_start").notNull(),

    // Starting & external capital (already token-denominated, not USD)
    startEth: real("start_eth").notNull(),
    startT0: real("start_t0").notNull(),
    startT1: real("start_t1").notNull(),
    startAero: real("start_aero").notNull(),
    extInflowT0: real("ext_inflow_t0").notNull().default(0),
    extInflowT1: real("ext_inflow_t1").notNull().default(0),

    // Ending position
    walletEth: real("wallet_eth").notNull(),
    walletT0: real("wallet_t0").notNull(),
    walletT1: real("wallet_t1").notNull(),
    walletAero: real("wallet_aero").notNull(),
    positionT0: real("position_t0").notNull(),
    positionT1: real("position_t1").notNull(),
    pendingAero: real("pending_aero").notNull(),

    // USD math
    startUsd: real("start_usd").notNull(),
    hodlUsd: real("hodl_usd").notNull(),
    stratUsd: real("strat_usd").notNull(),
    deltaUsd: real("delta_usd").notNull(),
    lpOnlyDeltaUsd: real("lp_only_delta_usd").notNull(),
    aeroAddedUsd: real("aero_added_usd").notNull(),
    deltaPct: real("delta_pct").notNull(),
    apr: real("apr").notNull(),
    totalGasEth: real("total_gas_eth").notNull(),
    totalGasUsd: real("total_gas_usd").notNull(),

    txCount: integer("tx_count").notNull(),
    gasTxsCounted: integer("gas_txs_counted").notNull(),
    positionsJson: text("positions_json").notNull(), // serialized array of {tokenId, ticks, liquidity, a0, a1, earned, curTick}
    inflowsJson: text("inflows_json").notNull(), // serialized list of external inflow rows

    // LP health / exit monitoring metrics
    netBenefitUsd: real("net_benefit_usd").notNull().default(0),
    netBenefitPct: real("net_benefit_pct").notNull().default(0),
    coverageRatio: real("coverage_ratio").notNull().default(0),   // aeroRewards / |lpOnlyDelta| ; >1 = rewards winning
    aeroVelocityPerHr: real("aero_velocity_per_hr"),              // $/hr earned in AERO vs prior snapshot
    lpDeltaVelocityPerHr: real("lp_delta_velocity_per_hr"),       // $/hr IL drag vs prior snapshot
  },
  (t) => ({ pk: primaryKey({ columns: [t.ts, t.address] }) }),
);

// Stored configuration for the monitored Safe (last-discovered pool/gauge, last-synced block, etc).
export const aeroConfig = sqliteTable("aero_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// veAERO (VotingEscrow NFT) snapshots — one row per token per sync run.
// Appended on every sync; historical rows are kept for charting.
export const aeroVeSnapshots = sqliteTable(
  "aero_ve_snapshots",
  {
    ts:              integer("ts").notNull(),           // unix seconds — when snapshot was taken
    address:         text("address").notNull(),         // monitored wallet address (lowercase)
    tokenId:         integer("token_id").notNull(),     // veNFT token ID
    lockedAero:      real("locked_aero").notNull(),     // AERO locked (human units, 18 dec)
    lockEnd:         integer("lock_end").notNull(),     // lock expiry as unix timestamp (0 if permanent)
    isPermanent:     integer("is_permanent", { mode: "boolean" }).notNull().default(false),
    votingPower:     real("voting_power").notNull(),    // current veAERO balance (decayed), human units
    claimableRebase: real("claimable_rebase").notNull(), // pending rebase AERO, human units
    aeroPrice:       real("aero_price"),                // AERO/USD at snapshot time (nullable — filled from prices table)
    lockedUsd:       real("locked_usd"),                // lockedAero * aeroPrice
    claimableUsd:    real("claimable_usd"),             // claimableRebase * aeroPrice
  },
  (t) => ({
    pk:         primaryKey({ columns: [t.ts, t.address, t.tokenId] }),
    addrTsIdx:  index("aero_ve_ts_addr_idx").on(t.address, t.ts),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Bounty / project job tracker
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Yankees Polymarket bets
// ─────────────────────────────────────────────────────────────────────────────

export const yankeesBets = sqliteTable("yankees_bets", {
  date: text("date").primaryKey(),            // YYYY-MM-DD game date
  opponent: text("opponent").notNull(),       // e.g. "BOS"
  side: text("side", { enum: ["YES", "NO"] }).notNull(),
  amount: real("amount").notNull(),           // USD bet size
  odds: real("odds").notNull(),              // share price 0–1
  payout: real("payout"),                    // gross payout if win
  // VOID = game postponed/rained-out → Polymarket market voided & stake refunded (no W/L, $0 P&L)
  result: text("result", { enum: ["WIN", "LOSS", "VOID"] }),
  profit: real("profit"),                    // net profit/loss (negative for loss)
  note: text("note"),
  betPlaced: integer("bet_placed", { mode: "boolean" }).notNull().default(true),
  tweetId: text("tweet_id"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Quotient Mirror strategy — synced from the strategy's shadow + live books
// (/home/mike/.openclaw/workspace/trading/strategies/quotient-mirror/state/)
// ─────────────────────────────────────────────────────────────────────────────

export const quotientPositions = sqliteTable("quotient_positions", {
  signalId: text("signal_id").primaryKey(),
  marketId: text("market_id"),
  headline: text("headline").notNull().default(""),
  slug: text("slug").notNull().default(""),
  side: text("side", { enum: ["YES", "NO"] }).notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  // shadow (paper) leg
  shadowStakeUsd: real("shadow_stake_usd"),
  shadowEntryCost: real("shadow_entry_cost"),   // cents
  shadowExitCost: real("shadow_exit_cost"),     // cents
  shadowPnlUsd: real("shadow_pnl_usd"),
  shadowRoiPct: real("shadow_roi_pct"),
  // live leg (null until phase=live fills)
  liveStakeUsd: real("live_stake_usd"),
  liveEntryPrice: real("live_entry_price"),     // 0–1
  liveExitPrice: real("live_exit_price"),
  livePnlUsd: real("live_pnl_usd"),
  liveEntryTx: text("live_entry_tx"),
  liveExitTx: text("live_exit_tx"),
  // shared metadata
  entryRef: real("entry_ref"),                  // Quotient published reference entry (cents)
  targetCost: real("target_cost"),              // Quotient fair price / take-profit (cents)
  volume24h: real("volume_24h"),
  publishedAt: text("published_at"),
  enteredAt: text("entered_at"),
  closedAt: text("closed_at"),
  closeReason: text("close_reason"),            // target_hit | time_stop | resolution
  endDate: text("end_date"),
  syncedAt: integer("synced_at").notNull(),     // unix seconds
});

// Single-row (id = 1) sync metadata for the quotient sync script.
export const quotientSync = sqliteTable("quotient_sync", {
  id: integer("id").primaryKey(), // always 1
  syncedAt: integer("synced_at").notNull(),
  phase: text("phase").notNull().default("shadow"),
  openCount: integer("open_count").notNull().default(0),
  closedCount: integer("closed_count").notNull().default(0),
  shadowPnlUsd: real("shadow_pnl_usd").notNull().default(0),
  livePnlUsd: real("live_pnl_usd").notNull().default(0),
  error: text("error"),
});

export const bountyJobs = sqliteTable("bounty_jobs", {
  id: text("id").primaryKey(),              // listing slug
  listingId: text("listing_id").notNull(),
  title: text("title").notNull(),
  reward: real("reward"),
  rewardToken: text("reward_token"),
  deadline: text("deadline"),
  type: text("type").notNull().default("bounty"),
  status: text("status").notNull().default("discovered"),
  cursorRunId: text("cursor_run_id"),
  prUrl: text("pr_url"),
  repoUrl: text("repo_url"),
  submissionId: text("submission_id"),
  errorMessage: text("error_message"),
  discoveredAt: text("discovered_at").notNull(),
  submittedAt: text("submitted_at"),
  updatedAt: text("updated_at").notNull(),
  otherInfo: text("other_info"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Trading orders — synced from CoW Swap, Bankr, and Definitive
// ─────────────────────────────────────────────────────────────────────────────

export const portfolioOrders = sqliteTable(
  "portfolio_orders",
  {
    // composite PK: source + orderId
    orderId: text("order_id").notNull(),
    source: text("source", { enum: ["cowswap", "bankr", "definitive"] }).notNull(),

    status: text("status").notNull().default("unknown"),
    type: text("type").notNull().default("market"),   // limit, market, dca, twap, stop
    side: text("side", { enum: ["buy", "sell"] }),

    // Token addresses (lowercase) — used to join against portfolio_positions
    sellToken: text("sell_token"),   // CoW/Definitive
    buyToken: text("buy_token"),     // CoW/Definitive
    tokenAddress: text("token_address"), // Bankr (single token ref)
    tokenSymbol: text("token_symbol"),

    // Amounts (raw strings to avoid precision loss)
    sellAmount: text("sell_amount"),
    buyAmount: text("buy_amount"),
    executedSellAmount: text("executed_sell_amount"),
    executedBuyAmount: text("executed_buy_amount"),
    fee: text("fee"),
    quantity: text("quantity"),
    filledQuantity: text("filled_quantity"),

    // Order metadata
    priceUsd: real("price_usd"),
    expiresAt: integer("expires_at"),    // unix seconds
    description: text("description"),   // Bankr human-readable description

    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    syncedAt: integer("synced_at").notNull(), // when we fetched this
  },
  (t) => ({
    pk: primaryKey({ columns: [t.source, t.orderId] }),
    tokenIdx: index("portfolio_orders_token_idx").on(t.tokenAddress),
    sellTokenIdx: index("portfolio_orders_sell_token_idx").on(t.sellToken),
    buyTokenIdx: index("portfolio_orders_buy_token_idx").on(t.buyToken),
    statusIdx: index("portfolio_orders_status_idx").on(t.status),
  })
);
