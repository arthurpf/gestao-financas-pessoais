export interface Account {
  id: number
  name: string
  type: string
  currency: string
  created_at: string
  archived_at: string | null
}

export interface Category {
  id: number
  name: string
  kind: 'expense' | 'income' | 'transfer'
  parent_id: number | null
  created_at: string
}

export interface Label {
  id: number
  name: string
  color: string
  created_at: string
}

export interface LabelWithUsage extends Label {
  usage_count: number
}

export interface LabelInput {
  name: string
  color: string
}

export interface TransactionLabel {
  id: number
  name: string
  color: string
}

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

export interface TransactionInput {
  account_id?: number | null
  credit_card_id?: number | null
  category_id?: number | null
  date: string
  amount_cents: number
  description: string
  notes?: string | null
  label_ids?: number[]
}

export interface ImportRow {
  account_id?: number | null
  credit_card_id?: number | null
  category_id?: number | null
  new_category_name?: string | null
  date: string
  amount_cents: number
  description: string
  notes?: string | null
}

export interface ImportOptions {
  skip_duplicates?: boolean
}

export interface ImportResult {
  batch_id: string
  inserted: number
  skipped_duplicates: number
  categories_created: number
}

export interface CreditCard {
  id: number
  name: string
  credit_limit_cents: number
  due_day: number
  best_purchase_day: number
  created_at: string
  archived_at: string | null
}

export interface CreditCardWithBalance extends CreditCard {
  balance_cents: number
}

export interface CreditCardBalanceHistoryRow {
  credit_card_id: number
  month: string
  balance_cents: number
}

export interface PayBillInput {
  credit_card_id: number
  account_id: number
  amount_cents: number
  date: string
  description?: string
}

export interface MonthlySummaryRow {
  month: string
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

export interface BackupCounts {
  accounts: number
  categories: number
  credit_cards: number
  labels: number
  transactions: number
}

export interface BackupExportResult {
  path: string
  counts: BackupCounts
}
