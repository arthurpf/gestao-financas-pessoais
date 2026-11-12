export const sql = `
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'checking',
  currency    TEXT NOT NULL DEFAULT 'BRL',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'expense',
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date             TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  description      TEXT NOT NULL,
  raw_description  TEXT,
  currency         TEXT NOT NULL DEFAULT 'BRL',
  source           TEXT NOT NULL DEFAULT 'manual',
  import_batch_id  TEXT,
  external_id      TEXT,
  dedup_hash       TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_external ON transactions(account_id, external_id)
  WHERE external_id IS NOT NULL;
`
