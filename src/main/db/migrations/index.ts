import type Database from 'better-sqlite3'
import { sql as initSql } from './001_init'
import { sql as creditCardsSql } from './002_credit_cards'
import { sql as transactionsSourceSql } from './003_transactions_source'
import { sql as labelsSql } from './004_labels'
import { sql as labelColorSql } from './005_label_color'

const migrations: { id: string; sql: string }[] = [
  { id: '001_init', sql: initSql },
  { id: '002_credit_cards', sql: creditCardsSql },
  { id: '003_transactions_source', sql: transactionsSourceSql },
  { id: '004_labels', sql: labelsSql },
  { id: '005_label_color', sql: labelColorSql }
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => (row as { id: string }).id)
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })()
  }
}
