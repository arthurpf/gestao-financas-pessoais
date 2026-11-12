import { ipcMain } from 'electron'
import { listLabels, createLabel, updateLabel, deleteLabel } from '../db/repositories/labels.repo'
import type { LabelInput } from '../db/repositories/labels.repo'

export function registerLabelsIpc(): void {
  ipcMain.handle('labels:list', () => listLabels())
  ipcMain.handle('labels:create', (_event, input: LabelInput) => createLabel(input))
  ipcMain.handle('labels:update', (_event, id: number, input: LabelInput) =>
    updateLabel(id, input)
  )
  ipcMain.handle('labels:delete', (_event, id: number) => deleteLabel(id))
}
