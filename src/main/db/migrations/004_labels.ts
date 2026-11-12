export const sql = `
CREATE TABLE IF NOT EXISTS labels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS transaction_labels (
  transaction_id  INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  label_id        INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_labels_label ON transaction_labels(label_id);
`
