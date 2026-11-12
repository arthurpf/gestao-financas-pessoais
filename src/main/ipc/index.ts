import { ipcMain } from 'electron'
import { registerAccountsIpc } from './accounts.ipc'
import { registerCategoriesIpc } from './categories.ipc'
import { registerTransactionsIpc } from './transactions.ipc'
import { registerCreditCardsIpc } from './creditCards.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerLabelsIpc } from './labels.ipc'
import { registerBackupIpc } from './backup.ipc'

export function registerIpc(): void {
  ipcMain.handle('system:ping', () => 'pong')
  registerAccountsIpc()
  registerCategoriesIpc()
  registerLabelsIpc()
  registerTransactionsIpc()
  registerCreditCardsIpc()
  registerSettingsIpc()
  registerBackupIpc()
}
