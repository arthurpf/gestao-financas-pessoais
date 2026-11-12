import { contextBridge, ipcRenderer } from 'electron'
import type { Account, AccountInput } from '../main/db/repositories/accounts.repo'
import type { Category, CategoryInput } from '../main/db/repositories/categories.repo'
import type { Label, LabelWithUsage, LabelInput } from '../main/db/repositories/labels.repo'
import type {
  Transaction,
  TransactionInput,
  TransactionFilter,
  MonthlySummaryRow,
  MonthlySummaryBySourceRow,
  ImportRow,
  ImportOptions,
  ImportResult
} from '../main/db/repositories/transactions.repo'
import type {
  CreditCard,
  CreditCardInput,
  CreditCardWithBalance,
  CreditCardBalanceHistoryRow,
  PayBillInput
} from '../main/db/repositories/creditCards.repo'

import type { RestoreResult } from '../main/db/repositories/backup.repo'
import type { BackupExportResult } from '../main/ipc/backup.ipc'

const api = {
  system: {
    ping: (): Promise<string> => ipcRenderer.invoke('system:ping')
  },
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (input: AccountInput): Promise<Account> => ipcRenderer.invoke('accounts:create', input)
  },
  categories: {
    list: (): Promise<Category[]> => ipcRenderer.invoke('categories:list'),
    create: (input: CategoryInput): Promise<Category> =>
      ipcRenderer.invoke('categories:create', input)
  },
  labels: {
    list: (): Promise<LabelWithUsage[]> => ipcRenderer.invoke('labels:list'),
    create: (input: LabelInput): Promise<Label> => ipcRenderer.invoke('labels:create', input),
    update: (id: number, input: LabelInput): Promise<Label> =>
      ipcRenderer.invoke('labels:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('labels:delete', id)
  },
  transactions: {
    list: (filter?: TransactionFilter): Promise<Transaction[]> =>
      ipcRenderer.invoke('transactions:list', filter),
    create: (input: TransactionInput): Promise<Transaction> =>
      ipcRenderer.invoke('transactions:create', input),
    update: (id: number, input: TransactionInput): Promise<Transaction> =>
      ipcRenderer.invoke('transactions:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('transactions:delete', id),
    importBatch: (rows: ImportRow[], options?: ImportOptions): Promise<ImportResult> =>
      ipcRenderer.invoke('transactions:importBatch', rows, options),
    monthlySummary: (range?: { from?: string; to?: string }): Promise<MonthlySummaryRow[]> =>
      ipcRenderer.invoke('transactions:monthlySummary', range),
    monthlySummaryBySource: (range?: {
      from?: string
      to?: string
    }): Promise<MonthlySummaryBySourceRow[]> =>
      ipcRenderer.invoke('transactions:monthlySummaryBySource', range)
  },
  creditCards: {
    list: (): Promise<CreditCard[]> => ipcRenderer.invoke('creditCards:list'),
    listWithBalance: (): Promise<CreditCardWithBalance[]> =>
      ipcRenderer.invoke('creditCards:listWithBalance'),
    create: (input: CreditCardInput): Promise<CreditCard> =>
      ipcRenderer.invoke('creditCards:create', input),
    update: (id: number, input: CreditCardInput): Promise<CreditCard> =>
      ipcRenderer.invoke('creditCards:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('creditCards:delete', id),
    balanceHistory: (): Promise<CreditCardBalanceHistoryRow[]> =>
      ipcRenderer.invoke('creditCards:balanceHistory'),
    payBill: (input: PayBillInput): Promise<void> => ipcRenderer.invoke('creditCards:payBill', input)
  },
  settings: {
    resetAllData: (): Promise<void> => ipcRenderer.invoke('settings:resetAllData')
  },
  backup: {
    /** Abre o diálogo de salvar e grava todos os dados em CSV. `null` = cancelado. */
    exportAll: (): Promise<BackupExportResult | null> => ipcRenderer.invoke('backup:export'),
    /** Substitui todos os dados pelo conteúdo de um backup (já dividido em células). */
    restore: (rows: string[][]): Promise<RestoreResult> => ipcRenderer.invoke('backup:restore', rows)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
