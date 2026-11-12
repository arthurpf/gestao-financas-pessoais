import type { Account, Category, CreditCard, ImportRow } from '../types/ipc'
import {
  normalizeText,
  parseAmountToCents,
  parseDate,
  type DateFormat,
  type NumberFormat
} from './csv'

/** Campos do sistema que uma coluna do CSV pode alimentar. */
export type FieldKey =
  | 'date'
  | 'amount'
  | 'description'
  | 'account'
  | 'credit_card'
  | 'category'
  | 'notes'

export interface FieldDef {
  key: FieldKey
  label: string
  required: boolean
  hint: string
  /** Nomes de cabeçalho (já normalizados) que sugerem este campo. */
  aliases: RegExp
}

export const FIELDS: FieldDef[] = [
  {
    key: 'date',
    label: 'Data',
    required: true,
    hint: 'AAAA-MM-DD, DD/MM/AAAA ou MM/DD/AAAA',
    aliases: /\b(data|date|dt|dia)\b/
  },
  {
    key: 'amount',
    label: 'Valor',
    required: true,
    hint: 'Positivo = receita, negativo = despesa',
    aliases: /\b(valor|value|amount|quantia|montante|total)\b/
  },
  {
    key: 'description',
    label: 'Descrição',
    required: false,
    hint: 'Se não mapeada, usa "Lançamento importado"',
    aliases: /(descri|historico|memo|estabelecimento|titulo|title|detalhe|lancamento|name|nome)/
  },
  {
    key: 'account',
    label: 'Conta',
    required: false,
    hint: 'Nome da conta. Vazia ou desconhecida: usa a conta padrão',
    aliases: /^(conta|account)/
  },
  {
    key: 'credit_card',
    label: 'Cartão de crédito',
    required: false,
    hint: 'Nome do cartão. Quando preenchido, tem prioridade sobre a conta',
    aliases: /(cartao|card)/
  },
  {
    key: 'category',
    label: 'Categoria',
    required: false,
    hint: 'Nome da categoria',
    aliases: /(categoria|category)/
  },
  {
    key: 'notes',
    label: 'Observações',
    required: false,
    hint: 'Texto livre',
    aliases: /(observ|notas?\b|notes?\b|obs\b)/
  }
]

export type Mapping = Record<FieldKey, number | null>

export const EMPTY_MAPPING: Mapping = {
  date: null,
  amount: null,
  description: null,
  account: null,
  credit_card: null,
  category: null,
  notes: null
}

/** Sugere o mapeamento a partir dos nomes das colunas (o usuário pode ajustar depois). */
export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = { ...EMPTY_MAPPING }
  const used = new Set<number>()
  const normalized = headers.map(normalizeText)

  // Ordem importa: campos mais específicos primeiro, para "Data lançamento" virar Data
  // e não Descrição.
  const order: FieldKey[] = ['date', 'amount', 'credit_card', 'account', 'category', 'notes', 'description']
  for (const key of order) {
    const def = FIELDS.find((f) => f.key === key)!
    const index = normalized.findIndex((h, i) => !used.has(i) && h !== '' && def.aliases.test(h))
    if (index !== -1) {
      mapping[key] = index
      used.add(index)
    }
  }
  return mapping
}

export interface ImportSettings {
  dateFormat: DateFormat
  numberFormat: NumberFormat
  /** Quando true, inverte o sinal (ex.: faturas que listam despesas como valores positivos). */
  invertSign: boolean
  /** Conta usada quando a linha não especifica (ou não encontra) uma conta. */
  defaultAccountId: number | null
  createMissingCategories: boolean
}

export interface ImportLookups {
  accounts: Account[]
  creditCards: CreditCard[]
  categories: Category[]
}

export interface PreparedRow {
  /** Posição da linha no arquivo (1 = primeira linha de dados). */
  line: number
  errors: string[]
  warnings: string[]
  /** Presente apenas quando a linha é válida. */
  payload: ImportRow | null
  /** Valores já interpretados, para a pré-visualização. */
  view: {
    date: string
    description: string
    target: string
    category: string
    amountCents: number | null
  }
}

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    const key = normalizeText(item.name)
    if (!map.has(key)) map.set(key, item)
  }
  return map
}

export function prepareRows(
  rows: string[][],
  mapping: Mapping,
  settings: ImportSettings,
  lookups: ImportLookups
): PreparedRow[] {
  const accounts = byName(lookups.accounts)
  const cards = byName(lookups.creditCards)
  const categories = byName(lookups.categories)

  // Regra de borda: sem conta informada, vai para a conta padrão (por padrão, a primeira da lista).
  const defaultAccount =
    lookups.accounts.find((a) => a.id === settings.defaultAccountId) ?? lookups.accounts[0] ?? null

  const cell = (row: string[], key: FieldKey): string => {
    const index = mapping[key]
    return index === null ? '' : (row[index] ?? '').trim()
  }

  return rows.map((row, i): PreparedRow => {
    const errors: string[] = []
    const warnings: string[] = []

    const rawDate = cell(row, 'date')
    const date = parseDate(rawDate, settings.dateFormat)
    if (!date) errors.push(rawDate ? `Data inválida: "${rawDate}"` : 'Data vazia')

    const rawAmount = cell(row, 'amount')
    let amountCents = parseAmountToCents(rawAmount, settings.numberFormat)
    if (amountCents === null) errors.push(rawAmount ? `Valor inválido: "${rawAmount}"` : 'Valor vazio')
    else if (settings.invertSign) amountCents = -amountCents

    const description = cell(row, 'description')

    // Destino: cartão (se informado e encontrado) > conta informada > conta padrão.
    let accountId: number | null = null
    let creditCardId: number | null = null
    let target = ''

    const cardName = cell(row, 'credit_card')
    if (cardName) {
      const card = cards.get(normalizeText(cardName))
      if (card) {
        creditCardId = card.id
        target = `Cartão: ${card.name}`
      } else {
        warnings.push(`Cartão "${cardName}" não encontrado`)
      }
    }
    if (creditCardId === null) {
      const accountName = cell(row, 'account')
      const account = accountName ? accounts.get(normalizeText(accountName)) : undefined
      if (accountName && !account) warnings.push(`Conta "${accountName}" não encontrada`)
      const resolved = account ?? defaultAccount
      if (resolved) {
        accountId = resolved.id
        target = resolved.name
      } else {
        errors.push('Nenhuma conta disponível')
      }
    }

    const categoryName = cell(row, 'category')
    let categoryId: number | null = null
    let newCategoryName: string | null = null
    let categoryLabel = ''
    if (categoryName) {
      const category = categories.get(normalizeText(categoryName))
      if (category) {
        categoryId = category.id
        categoryLabel = category.name
      } else if (settings.createMissingCategories) {
        newCategoryName = categoryName
        categoryLabel = `${categoryName} (nova)`
      } else {
        warnings.push(`Categoria "${categoryName}" não encontrada`)
      }
    }

    return {
      line: i + 1,
      errors,
      warnings,
      payload:
        errors.length === 0 && date !== null && amountCents !== null
        ? {
            account_id: accountId,
            credit_card_id: creditCardId,
            category_id: categoryId,
            new_category_name: newCategoryName,
            date,
            amount_cents: amountCents,
            description: description || 'Lançamento importado',
            notes: cell(row, 'notes') || null
          }
        : null,
      view: {
        date: date ?? rawDate,
        description,
        target,
        category: categoryLabel,
        amountCents
      }
    }
  })
}
