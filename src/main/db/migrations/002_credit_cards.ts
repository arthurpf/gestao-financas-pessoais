export const sql = `
CREATE TABLE IF NOT EXISTS credit_cards (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  credit_limit_cents INTEGER NOT NULL,
  due_day            INTEGER NOT NULL,
  best_purchase_day  INTEGER NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at        TEXT
);
`
