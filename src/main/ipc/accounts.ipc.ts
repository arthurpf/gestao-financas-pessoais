import { ipcMain } from 'electron'
import { listAccounts, createAccount } from '../db/repositories/accounts.repo'
import type { AccountInput } from '../db/repositories/accounts.repo'

export function registerAccountsIpc(): void {
  ipcMain.handle('accounts:list', () => listAccounts())
  ipcMain.handle('accounts:create', (_event, input: AccountInput) => createAccount(input))
}
