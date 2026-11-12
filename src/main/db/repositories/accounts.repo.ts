import { getDb } from '../connection'

export interface Account {
  id: number
  name: string
  type: string
  currency: string
  created_at: string
  archived_at: string | null
}

export interface AccountInput {
  name: string
  type?: string
  currency?: string
}

export function listAccounts(): Account[] {
  return getDb()
    .prepare('SELECT * FROM accounts WHERE archived_at IS NULL ORDER BY name')
    .all() as Account[]
}

export function createAccount(input: AccountInput): Account {
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO accounts (name, type, currency) VALUES (@name, @type, @currency)')
    .run({
      name: input.name,
      type: input.type ?? 'checking',
      currency: input.currency ?? 'BRL'
    })
  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(lastInsertRowid) as Account
}
