-- Boom Coin + Boom Wallet V1 schema (Preview/Test)
-- Source of truth: append-only ledger. Balance columns are projections only.
-- external_transfer_enabled = false

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'INTERNAL'),
  asset_type TEXT NOT NULL CHECK (asset_type = 'CLOSED_LOOP_UTILITY'),
  external_transfer INTEGER NOT NULL DEFAULT 0 CHECK (external_transfer = 0),
  withdrawal INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal = 0)
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  status TEXT NOT NULL CHECK (status IN ('NORMAL','LIMITED','REVIEW','FROZEN')),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, asset_id)
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  bucket TEXT NOT NULL CHECK (bucket IN ('available','pending','locked')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (wallet_id, bucket)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0 AND typeof(amount) = 'integer'),
  source_wallet_id TEXT,
  destination_wallet_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  risk_score INTEGER NOT NULL DEFAULT 0,
  previous_hash TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  wallet_account_id TEXT NOT NULL REFERENCES wallet_accounts(id),
  amount INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('debit','credit')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_security (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id),
  pin_hash TEXT,
  pin_salt TEXT,
  pin_enabled INTEGER NOT NULL DEFAULT 0,
  biometric_enabled INTEGER NOT NULL DEFAULT 1,
  step_up_required INTEGER NOT NULL DEFAULT 1,
  pin_fail_count INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_devices (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  device_name TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  approx_location TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallet_limits (
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  limit_key TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  PRIMARY KEY (wallet_id, limit_key)
);

CREATE TABLE IF NOT EXISTS coin_policies (
  id TEXT PRIMARY KEY NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  coin_enabled INTEGER NOT NULL DEFAULT 1,
  max_coin_amount INTEGER,
  max_coin_percent INTEGER
);

CREATE TABLE IF NOT EXISTS reward_pools (
  code TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id)
);

CREATE TABLE IF NOT EXISTS coin_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('LOCKED','CAPTURED','RELEASED')),
  reference_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coin_social_stats (
  profile_id TEXT PRIMARY KEY NOT NULL,
  lifetime_coins_received INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_coins_received >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT,
  code TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_accounts (
  code TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id)
);

CREATE TABLE IF NOT EXISTS ledger_checkpoints (
  id TEXT PRIMARY KEY NOT NULL,
  sequence INTEGER NOT NULL,
  last_hash TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  signature TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_created ON ledger_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallets_profile ON wallets(profile_id);
