import { ipcMain } from 'electron'
import { listCategories, createCategory } from '../db/repositories/categories.repo'
import type { CategoryInput } from '../db/repositories/categories.repo'

export function registerCategoriesIpc(): void {
  ipcMain.handle('categories:list', () => listCategories())
  ipcMain.handle('categories:create', (_event, input: CategoryInput) => createCategory(input))
}
