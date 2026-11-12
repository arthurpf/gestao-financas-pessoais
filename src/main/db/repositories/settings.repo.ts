import type Database from 'better-sqlite3'
import { getDb } from '../connection'

/**
 * Remove todos os registros de todas as tabelas de dados e reinicia os contadores de
 * AUTOINCREMENT. Deve ser chamada dentro de uma transação, com `foreign_keys = OFF`.
 */
export function deleteAllRows(db: Database.Database): void {
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`
      )
      .all() as { name: string }[]
  ).map((row) => row.name)

  for (const table of tables) {
    db.exec(`DELETE FROM "${table.replace(/"/g, '""')}"`)
  }
  db.exec('DELETE FROM sqlite_sequence')
}

/**
 * Apaga todos os registros de todas as tabelas de dados (contas, categorias,
 * cartões, lançamentos...). O esquema e o histórico de migrations são mantidos.
 */
export function resetAllData(): void {
  const db = getDb()

  // O PRAGMA foreign_keys não pode ser alterado dentro de uma transação.
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => deleteAllRows(db))()
  } finally {
    db.pragma('foreign_keys = ON')
  }

  db.exec('VACUUM')
}
