import { ipcMain } from 'electron'
import { resetAllData } from '../db/repositories/settings.repo'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:resetAllData', () => resetAllData())
}
