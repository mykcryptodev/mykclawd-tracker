import { sqlite } from "./client";

export function runMigrations() {
  sqlite.exec(`
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
  `);

  // Additive migrations for existing databases
  try {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN cg_checked INTEGER NOT NULL DEFAULT 0`);
    sqlite.exec(`UPDATE tokens SET cg_checked = 1 WHERE symbol != ''`);
  } catch { /* column already exists */ }

  try {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN zerion_id TEXT`);
  } catch { /* column already exists */ }

  try {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN zerion_checked INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  try {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN codex_checked INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  try {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN liquidity_usd REAL`);
  } catch { /* column already exists */ }

  // Fix block_timestamp = 0 in transactions (was a bug — now computed from block_number)
  sqlite.exec(`
    UPDATE transactions
    SET block_timestamp = 1686789347 + block_number * 2
    WHERE block_timestamp = 0
  `);
}
