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

    -- Portfolio NAV (Zerion-sourced) tables
    CREATE TABLE IF NOT EXISTS portfolio_nav (
      date TEXT PRIMARY KEY,
      value_usd REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'live' CHECK(source IN ('live', 'zerion_history'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_positions (
      token_address TEXT PRIMARY KEY,
      symbol TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      network TEXT NOT NULL DEFAULT 'Base',
      img_url TEXT,
      price REAL,
      balance REAL NOT NULL DEFAULT 0,
      balance_raw TEXT NOT NULL DEFAULT '0',
      balance_usd REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_sync (
      id INTEGER PRIMARY KEY,
      synced_at INTEGER NOT NULL,
      total_usd REAL NOT NULL,
      token_count INTEGER NOT NULL,
      native_eth_balance REAL NOT NULL DEFAULT 0,
      native_eth_usd REAL NOT NULL DEFAULT 0,
      error TEXT
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

    CREATE TABLE IF NOT EXISTS aero_ve_snapshots (
      ts INTEGER NOT NULL,
      address TEXT NOT NULL,
      token_id INTEGER NOT NULL,
      locked_aero REAL NOT NULL,
      lock_end INTEGER NOT NULL,
      is_permanent INTEGER NOT NULL DEFAULT 0,
      voting_power REAL NOT NULL,
      claimable_rebase REAL NOT NULL,
      aero_price REAL,
      locked_usd REAL,
      claimable_usd REAL,
      PRIMARY KEY (ts, address, token_id)
    );

    CREATE INDEX IF NOT EXISTS aero_ve_ts_addr_idx ON aero_ve_snapshots(address, ts);
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

  // Additive migrations for portfolio_sync native-ETH columns
  try { await client.execute(`ALTER TABLE portfolio_sync ADD COLUMN native_eth_balance REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_sync ADD COLUMN native_eth_usd REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }

  // Rebuild portfolio_nav once the history source moved from Zapper to Zerion.
  // Existing SQLite CHECK constraints cannot be altered in-place.
  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS portfolio_nav_next (
        date TEXT PRIMARY KEY,
        value_usd REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'live' CHECK(source IN ('live', 'zerion_history'))
      );
      INSERT OR REPLACE INTO portfolio_nav_next (date, value_usd, source)
      SELECT
        date,
        value_usd,
        CASE
          WHEN source = 'zapper_history' THEN 'zerion_history'
          WHEN source = 'zerion_history' THEN 'zerion_history'
          ELSE 'live'
        END
      FROM portfolio_nav;
      DROP TABLE portfolio_nav;
      ALTER TABLE portfolio_nav_next RENAME TO portfolio_nav;
    `);
  } catch { /* already migrated or empty DB */ }

  // Additive migrations for aero_snapshots LP health columns
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN net_benefit_usd REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN net_benefit_pct REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN coverage_ratio REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN aero_velocity_per_hr REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE aero_snapshots ADD COLUMN lp_delta_velocity_per_hr REAL`); } catch { /* exists */ }

  // Additive migrations for aero_transfers multi-address support
  try { await client.execute(`ALTER TABLE aero_transfers ADD COLUMN wallet_address TEXT NOT NULL DEFAULT '0xf142022273602c6a6c0ea7a044d21082273bd686'`); } catch { /* exists */ }
  try { await client.execute(`CREATE INDEX IF NOT EXISTS aero_transfers_addr_idx ON aero_transfers(wallet_address)`); } catch { /* exists */ }

  // Migrate aero_snapshots from single ts PK → composite (ts, address) PK so
  // multiple wallets can each have a snapshot at the same timestamp.
  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS aero_snapshots_new (
        ts INTEGER NOT NULL,
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
        inflows_json TEXT NOT NULL,
        net_benefit_usd REAL NOT NULL DEFAULT 0,
        net_benefit_pct REAL NOT NULL DEFAULT 0,
        coverage_ratio REAL NOT NULL DEFAULT 0,
        aero_velocity_per_hr REAL,
        lp_delta_velocity_per_hr REAL,
        PRIMARY KEY (ts, address)
      );
      INSERT OR IGNORE INTO aero_snapshots_new SELECT * FROM aero_snapshots;
      DROP TABLE aero_snapshots;
      ALTER TABLE aero_snapshots_new RENAME TO aero_snapshots;
    `);
  } catch { /* already migrated or table doesn't exist yet */ }

  // Yankees bets table
  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS yankees_bets (
        date TEXT PRIMARY KEY,
        opponent TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
        amount REAL NOT NULL,
        odds REAL NOT NULL,
        payout REAL,
        result TEXT CHECK(result IN ('WIN', 'LOSS')),
        profit REAL,
        note TEXT,
        bet_placed INTEGER NOT NULL DEFAULT 1,
        tweet_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } catch { /* exists */ }

  // Widen yankees_bets.result CHECK to allow 'VOID' (postponed/rained-out games →
  // Polymarket market voided & stake refunded). Rebuild only if the old constraint is present.
  try {
    const tbl = await client.execute(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='yankees_bets'`
    );
    const ddl = String(tbl.rows[0]?.sql ?? "");
    if (ddl && !ddl.includes("VOID")) {
      await client.executeMultiple(`
        CREATE TABLE yankees_bets_new (
          date TEXT PRIMARY KEY,
          opponent TEXT NOT NULL,
          side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
          amount REAL NOT NULL,
          odds REAL NOT NULL,
          payout REAL,
          result TEXT CHECK(result IN ('WIN', 'LOSS', 'VOID')),
          profit REAL,
          note TEXT,
          bet_placed INTEGER NOT NULL DEFAULT 1,
          tweet_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO yankees_bets_new SELECT date, opponent, side, amount, odds, payout, result, profit, note, bet_placed, tweet_id, created_at FROM yankees_bets;
        DROP TABLE yankees_bets;
        ALTER TABLE yankees_bets_new RENAME TO yankees_bets;
      `);
    }
  } catch { /* already migrated or table doesn't exist yet */ }

  // Reset any rows that were checked with the broken pipeline (no image found but pipeline was wrong)
  await client.execute(`UPDATE tokens SET image_checked = 0 WHERE image_url IS NULL AND image_checked = 1`);

  // ── Zerion PnL columns on portfolio_positions ─────────────────────────────
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN realized_gain REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN unrealized_gain REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN total_gain REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN total_gain_pct REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN realized_gain_pct REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN unrealized_gain_pct REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN total_invested REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN change_1d_usd REAL`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE portfolio_positions ADD COLUMN change_1d_pct REAL`); } catch { /* exists */ }

  // ── Cost-basis columns on lots (own-tracking PnL) ──────────────────────────
  try { await client.execute(`ALTER TABLE lots ADD COLUMN zero_basis_qty REAL NOT NULL DEFAULT 0`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE lots ADD COLUMN basis_complete INTEGER NOT NULL DEFAULT 1`); } catch { /* exists */ }

  // ── portfolio_orders table ─────────────────────────────────────────────────
  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS portfolio_orders (
        order_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('cowswap', 'bankr', 'definitive')),
        status TEXT NOT NULL DEFAULT 'unknown',
        type TEXT NOT NULL DEFAULT 'market',
        side TEXT CHECK(side IN ('buy', 'sell')),
        sell_token TEXT,
        buy_token TEXT,
        token_address TEXT,
        token_symbol TEXT,
        sell_amount TEXT,
        buy_amount TEXT,
        executed_sell_amount TEXT,
        executed_buy_amount TEXT,
        fee TEXT,
        quantity TEXT,
        filled_quantity TEXT,
        price_usd REAL,
        expires_at INTEGER,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        synced_at INTEGER NOT NULL,
        PRIMARY KEY (source, order_id)
      );
      CREATE INDEX IF NOT EXISTS portfolio_orders_token_idx ON portfolio_orders(token_address);
      CREATE INDEX IF NOT EXISTS portfolio_orders_sell_token_idx ON portfolio_orders(sell_token);
      CREATE INDEX IF NOT EXISTS portfolio_orders_buy_token_idx ON portfolio_orders(buy_token);
      CREATE INDEX IF NOT EXISTS portfolio_orders_status_idx ON portfolio_orders(status);
    `);
  } catch { /* exists */ }

  // ── quotient_mirror strategy tables ─────────────────────────────────────────
  try {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS quotient_positions (
        signal_id TEXT PRIMARY KEY,
        market_id TEXT,
        headline TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL DEFAULT '',
        side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
        shadow_stake_usd REAL,
        shadow_entry_cost REAL,
        shadow_exit_cost REAL,
        shadow_pnl_usd REAL,
        shadow_roi_pct REAL,
        live_stake_usd REAL,
        live_entry_price REAL,
        live_exit_price REAL,
        live_pnl_usd REAL,
        live_entry_tx TEXT,
        live_exit_tx TEXT,
        entry_ref REAL,
        target_cost REAL,
        volume_24h REAL,
        published_at TEXT,
        entered_at TEXT,
        closed_at TEXT,
        close_reason TEXT,
        end_date TEXT,
        synced_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS quotient_positions_status_idx ON quotient_positions(status);
      CREATE INDEX IF NOT EXISTS quotient_positions_entered_idx ON quotient_positions(entered_at);

      CREATE TABLE IF NOT EXISTS quotient_sync (
        id INTEGER PRIMARY KEY,
        synced_at INTEGER NOT NULL,
        phase TEXT NOT NULL DEFAULT 'shadow',
        open_count INTEGER NOT NULL DEFAULT 0,
        closed_count INTEGER NOT NULL DEFAULT 0,
        shadow_pnl_usd REAL NOT NULL DEFAULT 0,
        live_pnl_usd REAL NOT NULL DEFAULT 0,
        error TEXT
      );
    `);
  } catch { /* exists */ }

  // Fix block_timestamp = 0 in transactions (was a bug — now computed from block_number)
  await client.execute(`
    UPDATE transactions
    SET block_timestamp = 1686789347 + block_number * 2
    WHERE block_timestamp = 0
  `);
}
