import { getDb } from '../connection'
import { deleteAllRows } from './settings.repo'

/**
 * Backup completo em um único CSV. A primeira coluna (`tabela`) diz a que tabela cada linha
 * pertence; as demais colunas são a união dos campos de todas as tabelas (as que não se
 * aplicam ficam vazias). Os ids originais são preservados para manter os relacionamentos.
 */
export const BACKUP_FORMAT = 'gestao-financas-pessoais'
export const BACKUP_VERSION = 1
export const BACKUP_DELIMITER = ';'

export const BACKUP_COLUMNS = [
  'tabela',
  'id',
  'nome',
  'tipo',
  'moeda',
  'categoria_pai_id',
  'limite_centavos',
  'dia_vencimento',
  'dia_melhor_compra',
  'cor',
  'conta_id',
  'cartao_id',
  'categoria_id',
  'data',
  'valor_centavos',
  'descricao',
  'descricao_original',
  'origem',
  'lote_importacao',
  'id_externo',
  'hash_dedup',
  'observacoes',
  'etiquetas',
  'criado_em',
  'atualizado_em',
  'arquivado_em'
] as const

type Column = (typeof BACKUP_COLUMNS)[number]
type Cell = string | number | null | undefined
type Record_ = Partial<Record<Column, Cell>>

export interface BackupCounts {
  accounts: number
  categories: number
  credit_cards: number
  labels: number
  transactions: number
}

export interface BackupExport {
  csv: string
  counts: BackupCounts
}

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

function toLine(record: Record_): string {
  return BACKUP_COLUMNS.map((col) => escapeCell(record[col])).join(BACKUP_DELIMITER)
}

/** Gera o CSV (sem BOM) com todos os dados da base. */
export function buildBackupCsv(): BackupExport {
  const db = getDb()
  const lines: string[] = [BACKUP_COLUMNS.join(BACKUP_DELIMITER)]

  lines.push(
    toLine({
      tabela: 'meta',
      nome: BACKUP_FORMAT,
      tipo: BACKUP_VERSION,
      criado_em: new Date().toISOString()
    })
  )

  const accounts = db
    .prepare('SELECT id, name, type, currency, created_at, archived_at FROM accounts ORDER BY id')
    .all() as {
    id: number
    name: string
    type: string
    currency: string
    created_at: string
    archived_at: string | null
  }[]
  for (const a of accounts) {
    lines.push(
      toLine({
        tabela: 'conta',
        id: a.id,
        nome: a.name,
        tipo: a.type,
        moeda: a.currency,
        criado_em: a.created_at,
        arquivado_em: a.archived_at
      })
    )
  }

  const categories = db
    .prepare('SELECT id, name, kind, parent_id, created_at FROM categories ORDER BY id')
    .all() as {
    id: number
    name: string
    kind: string
    parent_id: number | null
    created_at: string
  }[]
  for (const c of categories) {
    lines.push(
      toLine({
        tabela: 'categoria',
        id: c.id,
        nome: c.name,
        tipo: c.kind,
        categoria_pai_id: c.parent_id,
        criado_em: c.created_at
      })
    )
  }

  const cards = db
    .prepare(
      `SELECT id, name, credit_limit_cents, due_day, best_purchase_day, created_at, archived_at
       FROM credit_cards ORDER BY id`
    )
    .all() as {
    id: number
    name: string
    credit_limit_cents: number
    due_day: number
    best_purchase_day: number
    created_at: string
    archived_at: string | null
  }[]
  for (const c of cards) {
    lines.push(
      toLine({
        tabela: 'cartao',
        id: c.id,
        nome: c.name,
        limite_centavos: c.credit_limit_cents,
        dia_vencimento: c.due_day,
        dia_melhor_compra: c.best_purchase_day,
        criado_em: c.created_at,
        arquivado_em: c.archived_at
      })
    )
  }

  const labels = db
    .prepare('SELECT id, name, color, created_at FROM labels ORDER BY id')
    .all() as { id: number; name: string; color: string; created_at: string }[]
  for (const l of labels) {
    lines.push(
      toLine({ tabela: 'etiqueta', id: l.id, nome: l.name, cor: l.color, criado_em: l.created_at })
    )
  }

  const labelsByTransaction = new Map<number, number[]>()
  for (const row of db
    .prepare('SELECT transaction_id, label_id FROM transaction_labels ORDER BY transaction_id, label_id')
    .all() as { transaction_id: number; label_id: number }[]) {
    const list = labelsByTransaction.get(row.transaction_id) ?? []
    list.push(row.label_id)
    labelsByTransaction.set(row.transaction_id, list)
  }

  const transactions = db.prepare('SELECT * FROM transactions ORDER BY id').all() as {
    id: number
    account_id: number | null
    credit_card_id: number | null
    category_id: number | null
    date: string
    amount_cents: number
    description: string
    raw_description: string | null
    currency: string
    source: string
    import_batch_id: string | null
    external_id: string | null
    dedup_hash: string | null
    notes: string | null
    created_at: string
    updated_at: string
  }[]
  for (const t of transactions) {
    lines.push(
      toLine({
        tabela: 'lancamento',
        id: t.id,
        conta_id: t.account_id,
        cartao_id: t.credit_card_id,
        categoria_id: t.category_id,
        data: t.date,
        valor_centavos: t.amount_cents,
        descricao: t.description,
        descricao_original: t.raw_description,
        moeda: t.currency,
        origem: t.source,
        lote_importacao: t.import_batch_id,
        id_externo: t.external_id,
        hash_dedup: t.dedup_hash,
        observacoes: t.notes,
        etiquetas: (labelsByTransaction.get(t.id) ?? []).join('|'),
        criado_em: t.created_at,
        atualizado_em: t.updated_at
      })
    )
  }

  return {
    csv: lines.join('\r\n') + '\r\n',
    counts: {
      accounts: accounts.length,
      categories: categories.length,
      credit_cards: cards.length,
      labels: labels.length,
      transactions: transactions.length
    }
  }
}

const TABLES = ['meta', 'conta', 'categoria', 'cartao', 'etiqueta', 'lancamento'] as const
type TableName = (typeof TABLES)[number]

/** Uma linha do CSV com leitores tipados e mensagens de erro que dizem onde está o problema. */
class Reader {
  constructor(
    private readonly row: string[],
    private readonly index: Map<string, number>,
    private readonly where: string
  ) {}

  private raw(col: Column): string {
    return this.row[this.index.get(col)!] ?? ''
  }

  text(col: Column): string | null {
    const value = this.raw(col)
    return value === '' ? null : value
  }

  requiredText(col: Column): string {
    const value = this.text(col)
    if (value === null) throw new Error(`${this.where}: "${col}" é obrigatório.`)
    return value
  }

  int(col: Column): number | null {
    const value = this.raw(col).trim()
    if (value === '') return null
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error(`${this.where}: "${col}" deve ser um número inteiro (valor: "${value}").`)
    }
    return Number(value)
  }

  requiredInt(col: Column): number {
    const value = this.int(col)
    if (value === null) throw new Error(`${this.where}: "${col}" é obrigatório.`)
    return value
  }

  intList(col: Column): number[] {
    const value = this.raw(col).trim()
    if (value === '') return []
    return value.split('|').map((part) => {
      if (!/^\d+$/.test(part.trim())) {
        throw new Error(`${this.where}: "${col}" tem um id inválido ("${part}").`)
      }
      return Number(part)
    })
  }
}

export interface RestoreResult extends BackupCounts {}

/**
 * Substitui TODOS os dados da base pelo conteúdo de um backup gerado por `buildBackupCsv`
 * (já separado em células pelo parser de CSV). Tudo ou nada: se algo estiver inválido,
 * a base permanece como estava.
 */
export function restoreBackup(rows: string[][]): RestoreResult {
  if (!Array.isArray(rows) || rows.some((r) => !Array.isArray(r))) {
    throw new Error('Conteúdo de backup inválido.')
  }
  if (rows.length < 2) throw new Error('O arquivo não contém dados.')

  const index = new Map<string, number>()
  rows[0].forEach((h, i) => index.set(h.trim().toLowerCase(), i))
  const missing = BACKUP_COLUMNS.filter((col) => !index.has(col))
  if (missing.length > 0) {
    throw new Error(`Este arquivo não é um backup válido (faltam colunas: ${missing.join(', ')}).`)
  }

  const grouped = new Map<TableName, Reader[]>(TABLES.map((t) => [t, []]))
  rows.slice(1).forEach((row, i) => {
    const table = (row[0] ?? '').trim().toLowerCase() as TableName
    if (!TABLES.includes(table)) {
      throw new Error(`Registro ${i + 1}: tabela desconhecida "${row[0] ?? ''}".`)
    }
    grouped.get(table)!.push(new Reader(row, index, `Registro ${i + 1} (${table})`))
  })

  const meta = grouped.get('meta')![0]
  if (!meta || meta.text('nome') !== BACKUP_FORMAT) {
    throw new Error('Este arquivo não foi gerado pela exportação deste aplicativo.')
  }
  const version = meta.int('tipo')
  if (version === null || version > BACKUP_VERSION) {
    throw new Error('Este backup foi criado por uma versão mais nova do aplicativo.')
  }

  const db = getDb()
  const counts: RestoreResult = {
    accounts: 0,
    categories: 0,
    credit_cards: 0,
    labels: 0,
    transactions: 0
  }
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

  // O PRAGMA foreign_keys não pode ser alterado dentro de uma transação.
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      deleteAllRows(db)

      const insertAccount = db.prepare(
        `INSERT INTO accounts (id, name, type, currency, created_at, archived_at)
         VALUES (@id, @name, @type, @currency, COALESCE(@created_at, ${now}), @archived_at)`
      )
      for (const r of grouped.get('conta')!) {
        insertAccount.run({
          id: r.requiredInt('id'),
          name: r.requiredText('nome'),
          type: r.text('tipo') ?? 'checking',
          currency: r.text('moeda') ?? 'BRL',
          created_at: r.text('criado_em'),
          archived_at: r.text('arquivado_em')
        })
        counts.accounts++
      }

      const insertCategory = db.prepare(
        `INSERT INTO categories (id, name, kind, parent_id, created_at)
         VALUES (@id, @name, @kind, @parent_id, COALESCE(@created_at, ${now}))`
      )
      for (const r of grouped.get('categoria')!) {
        insertCategory.run({
          id: r.requiredInt('id'),
          name: r.requiredText('nome'),
          kind: r.text('tipo') ?? 'expense',
          parent_id: r.int('categoria_pai_id'),
          created_at: r.text('criado_em')
        })
        counts.categories++
      }

      const insertCard = db.prepare(
        `INSERT INTO credit_cards
           (id, name, credit_limit_cents, due_day, best_purchase_day, created_at, archived_at)
         VALUES
           (@id, @name, @credit_limit_cents, @due_day, @best_purchase_day,
            COALESCE(@created_at, ${now}), @archived_at)`
      )
      for (const r of grouped.get('cartao')!) {
        insertCard.run({
          id: r.requiredInt('id'),
          name: r.requiredText('nome'),
          credit_limit_cents: r.requiredInt('limite_centavos'),
          due_day: r.requiredInt('dia_vencimento'),
          best_purchase_day: r.requiredInt('dia_melhor_compra'),
          created_at: r.text('criado_em'),
          archived_at: r.text('arquivado_em')
        })
        counts.credit_cards++
      }

      const insertLabel = db.prepare(
        `INSERT INTO labels (id, name, color, created_at)
         VALUES (@id, @name, @color, COALESCE(@created_at, ${now}))`
      )
      for (const r of grouped.get('etiqueta')!) {
        insertLabel.run({
          id: r.requiredInt('id'),
          name: r.requiredText('nome'),
          color: r.text('cor') ?? '#6366f1',
          created_at: r.text('criado_em')
        })
        counts.labels++
      }

      const insertTransaction = db.prepare(
        `INSERT INTO transactions
           (id, account_id, credit_card_id, category_id, date, amount_cents, description,
            raw_description, currency, source, import_batch_id, external_id, dedup_hash, notes,
            created_at, updated_at)
         VALUES
           (@id, @account_id, @credit_card_id, @category_id, @date, @amount_cents, @description,
            @raw_description, @currency, @source, @import_batch_id, @external_id, @dedup_hash,
            @notes, COALESCE(@created_at, ${now}), COALESCE(@updated_at, ${now}))`
      )
      const insertLink = db.prepare(
        'INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)'
      )
      for (const r of grouped.get('lancamento')!) {
        const id = r.requiredInt('id')
        const accountId = r.int('conta_id')
        const cardId = r.int('cartao_id')
        if ((accountId === null) === (cardId === null)) {
          throw new Error(
            `Lançamento ${id}: informe uma conta OU um cartão de crédito, não ambos nem nenhum.`
          )
        }
        const date = r.requiredText('data').trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error(`Lançamento ${id}: data inválida ("${date}").`)
        }
        insertTransaction.run({
          id,
          account_id: accountId,
          credit_card_id: cardId,
          category_id: r.int('categoria_id'),
          date,
          amount_cents: r.requiredInt('valor_centavos'),
          description: r.text('descricao') ?? '',
          raw_description: r.text('descricao_original'),
          currency: r.text('moeda') ?? 'BRL',
          source: r.text('origem') ?? 'manual',
          import_batch_id: r.text('lote_importacao'),
          external_id: r.text('id_externo'),
          dedup_hash: r.text('hash_dedup'),
          notes: r.text('observacoes'),
          created_at: r.text('criado_em'),
          updated_at: r.text('atualizado_em')
        })
        for (const labelId of r.intList('etiquetas')) insertLink.run(id, labelId)
        counts.transactions++
      }

      const broken = db.pragma('foreign_key_check') as { table: string; rowid: number }[]
      if (broken.length > 0) {
        throw new Error(
          `O backup tem referências quebradas (por exemplo, em "${broken[0].table}"): ` +
            'algum lançamento aponta para uma conta, cartão, categoria ou etiqueta inexistente.'
        )
      }
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }

  return counts
}
