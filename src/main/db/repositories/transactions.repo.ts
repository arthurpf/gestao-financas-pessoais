import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../connection'

export interface Transaction {
  id: number
  account_id: number | null
  credit_card_id: number | null
  category_id: number | null
  date: string
  amount_cents: number
  description: string
  currency: string
  source: string
  notes: string | null
  created_at: string
  labels: TransactionLabel[]
}

export interface TransactionLabel {
  id: number
  name: string
  color: string
}

export interface TransactionInput {
  account_id?: number | null
  credit_card_id?: number | null
  category_id?: number | null
  date: string // ISO 'YYYY-MM-DD'
  amount_cents: number // positive = income, negative = expense
  description: string
  notes?: string | null
  label_ids?: number[]
}

export interface TransactionFilter {
  account_id?: number
  credit_card_id?: number
  label_id?: number
  from?: string
  to?: string
  limit?: number
}

export interface MonthlySummaryRow {
  month: string // 'YYYY-MM'
  income_cents: number
  expense_cents: number
  difference_cents: number
}

export type SourceType = 'account' | 'credit_card'

export interface MonthlySummaryBySourceRow {
  month: string
  source_type: SourceType
  source_id: number
  source_name: string
  income_cents: number
  expense_cents: number
}

export function listTransactions(filter: TransactionFilter = {}): Transaction[] {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}

  if (filter.account_id !== undefined) {
    clauses.push('account_id = @account_id')
    params.account_id = filter.account_id
  }
  if (filter.credit_card_id !== undefined) {
    clauses.push('credit_card_id = @credit_card_id')
    params.credit_card_id = filter.credit_card_id
  }
  if (filter.label_id !== undefined) {
    clauses.push(
      'EXISTS (SELECT 1 FROM transaction_labels tl WHERE tl.transaction_id = transactions.id AND tl.label_id = @label_id)'
    )
    params.label_id = filter.label_id
  }
  if (filter.from) {
    clauses.push('date >= @from')
    params.from = filter.from
  }
  if (filter.to) {
    clauses.push('date <= @to')
    params.to = filter.to
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = filter.limit ?? 100

  const rows = getDb()
    .prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC LIMIT @limit`)
    .all({ ...params, limit }) as Omit<Transaction, 'labels'>[]

  return attachLabels(rows)
}

/** Anexa a cada lançamento a lista de suas etiquetas (uma única consulta para todos). */
function attachLabels(rows: Omit<Transaction, 'labels'>[]): Transaction[] {
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const labelRows = getDb()
    .prepare(
      `SELECT tl.transaction_id, l.id, l.name, l.color
       FROM transaction_labels tl
       JOIN labels l ON l.id = tl.label_id
       WHERE tl.transaction_id IN (SELECT value FROM json_each(@ids))
       ORDER BY l.name COLLATE NOCASE`
    )
    .all({ ids: JSON.stringify(ids) }) as (TransactionLabel & { transaction_id: number })[]

  const byTransaction = new Map<number, TransactionLabel[]>()
  for (const { transaction_id, id, name, color } of labelRows) {
    const list = byTransaction.get(transaction_id) ?? []
    list.push({ id, name, color })
    byTransaction.set(transaction_id, list)
  }
  return rows.map((r) => ({ ...r, labels: byTransaction.get(r.id) ?? [] }))
}

export function createTransaction(input: TransactionInput): Transaction {
  const accountId = input.account_id ?? null
  const creditCardId = input.credit_card_id ?? null
  if ((accountId === null) === (creditCardId === null)) {
    throw new Error('Informe uma conta OU um cartão de crédito, não ambos.')
  }

  const db = getDb()
  const labelIds = Array.from(new Set(input.label_ids ?? []))

  const id = db.transaction((): number => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO transactions (account_id, credit_card_id, category_id, date, amount_cents, description, notes, source)
         VALUES (@account_id, @credit_card_id, @category_id, @date, @amount_cents, @description, @notes, 'manual')`
      )
      .run({
        account_id: accountId,
        credit_card_id: creditCardId,
        category_id: input.category_id ?? null,
        date: input.date,
        amount_cents: input.amount_cents,
        description: input.description,
        notes: input.notes ?? null
      })

    const link = db.prepare(
      'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)'
    )
    for (const labelId of labelIds) link.run(lastInsertRowid, labelId)

    return Number(lastInsertRowid)
  })()

  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Omit<
    Transaction,
    'labels'
  >
  return attachLabels([row])[0]
}

/**
 * Atualiza um lançamento existente (inclusive a fonte: conta ou cartão) e substitui suas etiquetas.
 * `category_id` e `notes` só são alterados quando informados; a origem (`source`) é preservada.
 */
export function updateTransaction(id: number, input: TransactionInput): Transaction {
  const accountId = input.account_id ?? null
  const creditCardId = input.credit_card_id ?? null
  if ((accountId === null) === (creditCardId === null)) {
    throw new Error('Informe uma conta OU um cartão de crédito, não ambos.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Data inválida.')
  if (!Number.isInteger(input.amount_cents) || input.amount_cents === 0) {
    throw new Error('Valor inválido.')
  }
  const description = input.description.trim()
  if (!description) throw new Error('Descrição é obrigatória.')

  const db = getDb()
  const labelIds = Array.from(new Set(input.label_ids ?? []))

  db.transaction(() => {
    const { changes } = db
      .prepare(
        `UPDATE transactions
            SET account_id = @account_id,
                credit_card_id = @credit_card_id,
                category_id = CASE WHEN @set_category = 1 THEN @category_id ELSE category_id END,
                date = @date,
                amount_cents = @amount_cents,
                description = @description,
                notes = CASE WHEN @set_notes = 1 THEN @notes ELSE notes END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = @id`
      )
      .run({
        id,
        account_id: accountId,
        credit_card_id: creditCardId,
        set_category: input.category_id !== undefined ? 1 : 0,
        category_id: input.category_id ?? null,
        date: input.date,
        amount_cents: input.amount_cents,
        description,
        set_notes: input.notes !== undefined ? 1 : 0,
        notes: input.notes ?? null
      })
    if (changes === 0) throw new Error('Lançamento não encontrado.')

    db.prepare('DELETE FROM transaction_labels WHERE transaction_id = ?').run(id)
    const link = db.prepare('INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)')
    for (const labelId of labelIds) link.run(id, labelId)
  })()

  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Omit<
    Transaction,
    'labels'
  >
  return attachLabels([row])[0]
}

/** Exclui o lançamento (as ligações com etiquetas somem em cascata). */
export function deleteTransaction(id: number): void {
  const { changes } = getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id)
  if (changes === 0) throw new Error('Lançamento não encontrado.')
}

export interface ImportRow {
  /** Conta de destino. Se ausente (e sem cartão), usa a primeira conta da lista. */
  account_id?: number | null
  credit_card_id?: number | null
  category_id?: number | null
  /** Nome de uma categoria a criar (se ainda não existir) e associar ao lançamento. */
  new_category_name?: string | null
  date: string // ISO 'YYYY-MM-DD'
  amount_cents: number // positive = income, negative = expense
  description: string
  notes?: string | null
}

export interface ImportOptions {
  /** Ignora linhas idênticas a lançamentos de importações anteriores. Padrão: true. */
  skip_duplicates?: boolean
}

export interface ImportResult {
  batch_id: string
  inserted: number
  skipped_duplicates: number
  categories_created: number
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * Importa vários lançamentos de uma vez (ex.: vindos de um CSV), de forma atômica:
 * se qualquer linha for inválida, nada é gravado.
 */
export function importTransactions(rows: ImportRow[], options: ImportOptions = {}): ImportResult {
  const db = getDb()
  const skipDuplicates = options.skip_duplicates ?? true
  const batchId = randomUUID()

  const run = db.transaction((): ImportResult => {
    const firstAccount = db
      .prepare('SELECT id FROM accounts WHERE archived_at IS NULL ORDER BY name LIMIT 1')
      .get() as { id: number } | undefined

    const categoryIdsByName = new Map<string, number>()
    for (const c of db.prepare('SELECT id, name FROM categories').all() as {
      id: number
      name: string
    }[]) {
      const key = normalizeName(c.name)
      if (!categoryIdsByName.has(key)) categoryIdsByName.set(key, c.id)
    }

    const insert = db.prepare(
      `INSERT INTO transactions
         (account_id, credit_card_id, category_id, date, amount_cents, description,
          raw_description, source, import_batch_id, dedup_hash, notes)
       VALUES
         (@account_id, @credit_card_id, @category_id, @date, @amount_cents, @description,
          @raw_description, 'csv', @batch_id, @dedup_hash, @notes)`
    )
    const hashExists = db.prepare('SELECT 1 FROM transactions WHERE dedup_hash = ? LIMIT 1')
    const insertCategory = db.prepare('INSERT INTO categories (name, kind) VALUES (?, ?)')

    // Quantas vezes cada combinação já apareceu neste arquivo: dois lançamentos idênticos
    // legítimos (ex.: dois cafés iguais no mesmo dia) geram hashes distintos.
    const occurrences = new Map<string, number>()
    let inserted = 0
    let skipped = 0
    let categoriesCreated = 0

    rows.forEach((row, index) => {
      const label = `Linha ${index + 1}`
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error(`${label}: data inválida.`)
      if (!Number.isInteger(row.amount_cents)) throw new Error(`${label}: valor inválido.`)

      let accountId = row.account_id ?? null
      const creditCardId = row.credit_card_id ?? null
      if (accountId !== null && creditCardId !== null) {
        throw new Error(`${label}: informe uma conta OU um cartão, não ambos.`)
      }
      if (accountId === null && creditCardId === null) {
        // Lançamento sem conta especificada: vai para a primeira conta da lista.
        if (!firstAccount) throw new Error(`${label}: nenhuma conta cadastrada para receber o lançamento.`)
        accountId = firstAccount.id
      }

      const description = row.description.trim() || 'Lançamento importado'

      const sourceKey = accountId !== null ? `a${accountId}` : `c${creditCardId}`
      const baseKey = [sourceKey, row.date, row.amount_cents, normalizeName(description)].join('|')
      const occurrence = (occurrences.get(baseKey) ?? 0) + 1
      occurrences.set(baseKey, occurrence)
      const dedupHash = createHash('sha1').update(`${baseKey}|${occurrence}`).digest('hex')

      if (skipDuplicates && hashExists.get(dedupHash)) {
        skipped++
        return
      }

      let categoryId = row.category_id ?? null
      const newCategoryName = row.new_category_name?.trim()
      if (categoryId === null && newCategoryName) {
        const key = normalizeName(newCategoryName)
        let id = categoryIdsByName.get(key)
        if (id === undefined) {
          const kind = row.amount_cents > 0 ? 'income' : 'expense'
          id = Number(insertCategory.run(newCategoryName, kind).lastInsertRowid)
          categoryIdsByName.set(key, id)
          categoriesCreated++
        }
        categoryId = id
      }

      insert.run({
        account_id: accountId,
        credit_card_id: creditCardId,
        category_id: categoryId,
        date: row.date,
        amount_cents: row.amount_cents,
        description,
        raw_description: row.description,
        batch_id: batchId,
        dedup_hash: dedupHash,
        notes: row.notes?.trim() || null
      })
      inserted++
    })

    return {
      batch_id: batchId,
      inserted,
      skipped_duplicates: skipped,
      categories_created: categoriesCreated
    }
  })

  return run()
}

export function getMonthlySummary(range: { from?: string; to?: string } = {}): MonthlySummaryRow[] {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}

  if (range.from) {
    clauses.push('date >= @from')
    params.from = range.from
  }
  if (range.to) {
    clauses.push('date <= @to')
    params.to = range.to
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  return getDb()
    .prepare(
      `SELECT
         strftime('%Y-%m', date) AS month,
         SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income_cents,
         SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) AS expense_cents,
         SUM(amount_cents) AS difference_cents
       FROM transactions
       ${where}
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(params) as MonthlySummaryRow[]
}

export function getMonthlySummaryBySource(
  range: { from?: string; to?: string } = {}
): MonthlySummaryBySourceRow[] {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}

  if (range.from) {
    clauses.push('t.date >= @from')
    params.from = range.from
  }
  if (range.to) {
    clauses.push('t.date <= @to')
    params.to = range.to
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  return getDb()
    .prepare(
      `SELECT
         strftime('%Y-%m', t.date) AS month,
         CASE WHEN t.account_id IS NOT NULL THEN 'account' ELSE 'credit_card' END AS source_type,
         COALESCE(t.account_id, t.credit_card_id) AS source_id,
         COALESCE(a.name, c.name) AS source_name,
         SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END) AS income_cents,
         SUM(CASE WHEN t.amount_cents < 0 THEN -t.amount_cents ELSE 0 END) AS expense_cents
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN credit_cards c ON c.id = t.credit_card_id
       ${where}
       GROUP BY month, source_type, source_id
       ORDER BY month ASC`
    )
    .all(params) as MonthlySummaryBySourceRow[]
}
