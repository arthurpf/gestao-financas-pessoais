import { app, BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildBackupCsv,
  restoreBackup,
  type BackupCounts
} from '../db/repositories/backup.repo'

export interface BackupExportResult {
  path: string
  counts: BackupCounts
}

function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function registerBackupIpc(): void {
  // Pergunta onde salvar e grava o CSV. Retorna null se o usuário cancelar.
  ipcMain.handle('backup:export', async (event): Promise<BackupExportResult | null> => {
    const options: SaveDialogOptions = {
      title: 'Exportar todos os dados',
      defaultPath: path.join(app.getPath('documents'), `financas-backup-${todayStamp()}.csv`),
      filters: [{ name: 'Arquivo CSV', extensions: ['csv'] }]
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null

    const { csv, counts } = buildBackupCsv()
    // BOM para o Excel reconhecer o UTF-8 (acentos).
    await fs.writeFile(filePath, '﻿' + csv, 'utf8')
    return { path: filePath, counts }
  })

  ipcMain.handle('backup:restore', (_event, rows: string[][]) => restoreBackup(rows))
}
