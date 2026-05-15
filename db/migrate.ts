import { client } from "./client";

export async function runMigrations() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tokens (
      contract_address TEXT PRIMARY KEY,
      symbol TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      decimals INTEGER NOT NULL DEFAULT 18,
      coingecko_id TEXT,
      is_priced INTEGER NOT NULL DEFAULT 0,
      cg_checked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transfers (
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL DEFAULT 0,
      block_number INTEGER NOT NULL,
      block_timestamp INTEGER NOT NULL,
      token_address TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      raw_amount TEXT NOT NULL,
      counterparty TEXT,
      PRIMARY KEY (tx_hash, log_index)
    );
    CREATE INDEX IF NOT EXISTS transfers_ts_idx ON transfers(block_timestamp);
    CREATE INDEX IF NOT EXISTS transfers_token_idx ON transfers(token_address);

    CREATE TABLE IF NOT EXISTS transactions (
      tx_hash TEXT PRIMARY KEY,
      block_number INTEGER NOT NULL,
      block_timestamp INTEGER NOT NULL,
      gas_used TEXT NOT NULL,
      effective_gas_price TEXT NOT NULL,
      gas_eth_wei TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prices (
      token_address TEXT NOT NULL,
      date TEXT NOT NULL,
      price_usd REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'coingecko',
      PRIMARY KEY (token_address, date)
    );
    CREATE INDEX IF NOT EXISTS prices_token_date_idx ON prices(token_address, date);

    CREATE TABLE IF NOT EXISTS lots (
      token_address TEXT PRIMARY KEY,
      quantity TEXT NOT NULL DEFAULT '0',
      avg_cost_usd REAL NOT NULL DEFAULT 0,
      realized_pnl_usd REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      date TEXT PRIMARY KEY,
      total_value_usd REAL NOT NULL,
      total_cost_basis_usd REAL NOT NULL,
      unrealized_pnl_usd REAL NOT NULL,
      realized_pnl_usd_cum REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Aerodrome LP rebalance monitor tables
    CREATE TABLE IF NOT EXISTS aero_transfers (
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      block_timestamp INTEGER NOT NULL,
      token_address TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimals INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      counterparty TEXT NOT NULL,
      raw_amount TEXT NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );
    CREATE INDEX IF NOT EXISTS aero_transfers_ts_idx ON aero_transfers(block_timestamp);
    CREATE INDEX IF NOT EXISTS aero_transfers_block_idx ON aero_transfers(block_number);

    CREATE TABLE IF NOT EXISTS aero_gas_cache (
      tx_hash TEXT PRIMARY KEY,
      gas_wei TEXT NOT NULL,
      block_number INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aero_snapshots (
      ts INTEGER PRIMARY KEY,
      address TEXT NOT NULL,
      pool TEXT NOT NULL,
      gauge TEXT NOT NULL,
      token0 TEXT NOT NULL,
      token1 TEXT NOT NULL,
      sym0 TEXT NOT NULL,
      sym1 TEXT NOT NULL,
      dec0 INTEGER NOT NULL,
      dec1 INTEGER NOT NULL,
      first_ts INTEGER NOT NULL,
      last_ts INTEGER NOT NULL,
      days REAL NOT NULL,
      p0_now REAL NOT NULL,
      p1_now REAL NOT NULL,
      pa_now REAL NOT NULL,
      p0_start REAL NOT NULL,
      p1_start REAL NOT NULL,
      pa_start REAL NOT NULL,
      start_eth REAL NOT NULL,
      start_t0 REAL NOT NULL,
      start_t1 REAL NOT NULL,
      start_aero REAL NOT NULL,
      ext_inflow_t0 REAL NOT NULL DEFAULT 0,
      ext_inflow_t1 REAL NOT NULL DEFAULT 0,
      wallet_eth REAL NOT NULL,
      wallet_t0 REAL NOT NULL,
      wallet_t1 REAL NOT NULL,
      wallet_aero REAL NOT NULL,
      position_t0 REAL NOT NULL,
      position_t1 REAL NOT NULL,
      pending_aero REAL NOT NULL,
      start_usd REAL NOT NULL,
      hodl_usd REAL NOT NULL,
      strat_usd REAL NOT NULL,
      delta_usd REAL NOT NULL,
      lp_only_delta_usd REAL NOT NULL,
      aero_added_usd REAL NOT NULL,
      delta_pct REAL NOT NULL,
      apr REAL NOT NULL,
      total_gas_eth REAL NOT NULL,
      total_gas_usd REAL NOT NULL,
      tx_count INTEGER NOT NULL,
      gas_txs_counted INTEGER NOT NULL,
      positions_json TEXT NOT NULL,
      inflows_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aero_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Additive migrations for existing databases
  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN cg_checked INTEGER NOT NULL DEFAULT 0`);
    await client.execute(`UPDATE tokens SET cg_checked = 1 WHERE symbol != ''`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN zerion_id TEXT`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN zerion_checked INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN codex_checked INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN liquidity_usd REAL`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN image_url TEXT`);
  } catch { /* column already exists */ }

  try {
    await client.execute(`ALTER TABLE tokens ADD COLUMN image_checked INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Additive migrations for aero_snapshots LP health columns
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN net_benefit_usd REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN net_benefit_pct REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN coverage_ratio REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN aero_velocity_per_hr REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN lp_delta_velocity_per_hr REAL`); } catch { /* exists */ }

  // Reset any rows that were checked with the broken pipeline (no image found but pipeline was wrong)
  await client.execute(`UPDATE tokens SET image_checked = 0 WHERE image_url IS NULL AND image_checked = 1`);

  // Fix block_timestamp = 0 in transactions (was a bug — now computed from block_number)
  await client.execute(`
    UPDATE transactions
    SET block_timestamp = 1686789347 + block_number * 2
    WHERE block_timestamp = 0
  `);
}
