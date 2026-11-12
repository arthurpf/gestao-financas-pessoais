import { ipcMain } from 'electron'
import {
  listCreditCards,
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
  listCreditCardsWithBalance,
  getCreditCardBalanceHistory,
  payCreditCardBill
} from '../db/repositories/creditCards.repo'
import type { CreditCardInput, PayBillInput } from '../db/repositories/creditCards.repo'

export function registerCreditCardsIpc(): void {
  ipcMain.handle('creditCards:list', () => listCreditCards())
  ipcMain.handle('creditCards:listWithBalance', () => listCreditCardsWithBalance())
  ipcMain.handle('creditCards:create', (_event, input: CreditCardInput) =>
    createCreditCard(input)
  )
  ipcMain.handle('creditCards:update', (_event, id: number, input: CreditCardInput) =>
    updateCreditCard(id, input)
  )
  ipcMain.handle('creditCards:delete', (_event, id: number) => deleteCreditCard(id))
  ipcMain.handle('creditCards:balanceHistory', () => getCreditCardBalanceHistory())
  ipcMain.handle('creditCards:payBill', (_event, input: PayBillInput) => payCreditCardBill(input))
}
