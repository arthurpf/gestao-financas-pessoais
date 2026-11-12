import { ipcMain } from 'electron'
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary,
  getMonthlySummaryBySource,
  importTransactions
} from '../db/repositories/transactions.repo'
import type {
  TransactionInput,
  TransactionFilter,
  ImportRow,
  ImportOptions
} from '../db/repositories/transactions.repo'

export function registerTransactionsIpc(): void {
  ipcMain.handle('transactions:list', (_event, filter?: TransactionFilter) =>
    listTransactions(filter)
  )
  ipcMain.handle('transactions:create', (_event, input: TransactionInput) =>
    createTransaction(input)
  )
  ipcMain.handle('transactions:update', (_event, id: number, input: TransactionInput) =>
    updateTransaction(id, input)
  )
  ipcMain.handle('transactions:delete', (_event, id: number) => deleteTransaction(id))
  ipcMain.handle('transactions:importBatch', (_event, rows: ImportRow[], options?: ImportOptions) =>
    importTransactions(rows, options)
  )
  ipcMain.handle('transactions:monthlySummary', (_event, range?: { from?: string; to?: string }) =>
    getMonthlySummary(range)
  )
  ipcMain.handle(
    'transactions:monthlySummaryBySource',
    (_event, range?: { from?: string; to?: string }) => getMonthlySummaryBySource(range)
  )
}
