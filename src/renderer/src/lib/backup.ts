import type { BackupCounts } from '../types/ipc'

/** Backup gerado pela exportação do app: primeira coluna `tabela` e uma linha `meta`. */
export function looksLikeBackup(rows: string[][]): boolean {
  const header = rows[0]
  if (!header || header[0]?.trim().toLowerCase() !== 'tabela') return false
  return rows.slice(1).some((r) => r[0]?.trim().toLowerCase() === 'meta')
}

export function countBackupRecords(rows: string[][]): BackupCounts {
  const counts: BackupCounts = {
    accounts: 0,
    categories: 0,
    credit_cards: 0,
    labels: 0,
    transactions: 0
  }
  for (const row of rows.slice(1)) {
    switch (row[0]?.trim().toLowerCase()) {
      case 'conta':
        counts.accounts++
        break
      case 'categoria':
        counts.categories++
        break
      case 'cartao':
        counts.credit_cards++
        break
      case 'etiqueta':
        counts.labels++
        break
      case 'lancamento':
        counts.transactions++
        break
    }
  }
  return counts
}
