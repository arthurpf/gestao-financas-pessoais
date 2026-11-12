export const sql = `
CREATE TABLE transactions_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  credit_card_id   INTEGER REFERENCES credit_cards(id) ON DELETE CASCADE,
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
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    (account_id IS NOT NULL AND credit_card_id IS NULL) OR
    (account_id IS NULL AND credit_card_id IS NOT NULL)
  )
);

INSERT INTO transactions_new (
  id, account_id, credit_card_id, category_id, date, amount_cents, description,
  raw_description, currency, source, import_batch_id, external_id, dedup_hash,
  notes, created_at, updated_at
)
SELECT
  id, account_id, NULL, category_id, date, amount_cents, description,
  raw_description, currency, source, import_batch_id, external_id, dedup_hash,
  notes, created_at, updated_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_card_date ON transactions(credit_card_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_external ON transactions(account_id, external_id)
  WHERE external_id IS NOT NULL;
`
