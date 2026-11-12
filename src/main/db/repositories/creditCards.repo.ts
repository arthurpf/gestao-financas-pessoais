import { getDb } from '../connection'

export interface CreditCard {
  id: number
  name: string
  credit_limit_cents: number
  due_day: number
  best_purchase_day: number
  created_at: string
  archived_at: string | null
}

export interface CreditCardInput {
  name: string
  credit_limit_cents: number
  due_day: number
  best_purchase_day: number
}

function assertValidInput(input: CreditCardInput): void {
  if (!input.name.trim()) throw new Error('Nome é obrigatório.')
  if (!Number.isInteger(input.credit_limit_cents) || input.credit_limit_cents <= 0) {
    throw new Error('Limite de crédito deve ser maior que zero.')
  }
  if (!Number.isInteger(input.due_day) || input.due_day < 1 || input.due_day > 31) {
    throw new Error('Dia de vencimento deve estar entre 1 e 31.')
  }
  if (
    !Number.isInteger(input.best_purchase_day) ||
    input.best_purchase_day < 1 ||
    input.best_purchase_day > 31
  ) {
    throw new Error('Melhor dia de compra deve estar entre 1 e 31.')
  }
}

export function listCreditCards(): CreditCard[] {
  return getDb()
    .prepare('SELECT * FROM credit_cards WHERE archived_at IS NULL ORDER BY name')
    .all() as CreditCard[]
}

export function createCreditCard(input: CreditCardInput): CreditCard {
  assertValidInput(input)
  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO credit_cards (name, credit_limit_cents, due_day, best_purchase_day)
       VALUES (@name, @credit_limit_cents, @due_day, @best_purchase_day)`
    )
    .run({
      name: input.name.trim(),
      credit_limit_cents: input.credit_limit_cents,
      due_day: input.due_day,
      best_purchase_day: input.best_purchase_day
    })
  return getDb()
    .prepare('SELECT * FROM credit_cards WHERE id = ?')
    .get(lastInsertRowid) as CreditCard
}

export function updateCreditCard(id: number, input: CreditCardInput): CreditCard {
  assertValidInput(input)
  getDb()
    .prepare(
      `UPDATE credit_cards
       SET name = @name,
           credit_limit_cents = @credit_limit_cents,
           due_day = @due_day,
           best_purchase_day = @best_purchase_day
       WHERE id = @id`
    )
    .run({
      id,
      name: input.name.trim(),
      credit_limit_cents: input.credit_limit_cents,
      due_day: input.due_day,
      best_purchase_day: input.best_purchase_day
    })
  return getDb().prepare('SELECT * FROM credit_cards WHERE id = ?').get(id) as CreditCard
}

export function deleteCreditCard(id: number): void {
  getDb().prepare('DELETE FROM credit_cards WHERE id = ?').run(id)
}

export interface CreditCardWithBalance extends CreditCard {
  balance_cents: number
}

export function listCreditCardsWithBalance(): CreditCardWithBalance[] {
  return getDb()
    .prepare(
      `SELECT cc.*, COALESCE(SUM(-t.amount_cents), 0) AS balance_cents
       FROM credit_cards cc
       LEFT JOIN transactions t ON t.credit_card_id = cc.id
       WHERE cc.archived_at IS NULL
       GROUP BY cc.id
       ORDER BY cc.name`
    )
    .all() as CreditCardWithBalance[]
}

export interface CreditCardBalanceHistoryRow {
  credit_card_id: number
  month: string
  balance_cents: number
}

export function getCreditCardBalanceHistory(): CreditCardBalanceHistoryRow[] {
  return getDb()
    .prepare(
      `WITH monthly AS (
         SELECT credit_card_id, strftime('%Y-%m', date) AS month, SUM(-amount_cents) AS net_change
         FROM transactions
         WHERE credit_card_id IS NOT NULL
         GROUP BY credit_card_id, month
       )
       SELECT
         credit_card_id,
         month,
         SUM(net_change) OVER (PARTITION BY credit_card_id ORDER BY month) AS balance_cents
       FROM monthly
       ORDER BY credit_card_id, month`
    )
    .all() as CreditCardBalanceHistoryRow[]
}

export interface PayBillInput {
  credit_card_id: number
  account_id: number
  amount_cents: number
  date: string
  description?: string
}

export function payCreditCardBill(input: PayBillInput): void {
  if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
    throw new Error('Valor do pagamento deve ser maior que zero.')
  }
  const description = input.description?.trim() || 'Pagamento de fatura'
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO transactions (account_id, date, amount_cents, description, source)
       VALUES (@account_id, @date, @amount_cents, @description, 'card_payment')`
    ).run({
      account_id: input.account_id,
      date: input.date,
      amount_cents: -input.amount_cents,
      description
    })
    db.prepare(
      `INSERT INTO transactions (credit_card_id, date, amount_cents, description, source)
       VALUES (@credit_card_id, @date, @amount_cents, @description, 'card_payment')`
    ).run({
      credit_card_id: input.credit_card_id,
      date: input.date,
      amount_cents: input.amount_cents,
      description
    })
  })()
}
