import { getDb } from '../connection'

export interface Category {
  id: number
  name: string
  kind: 'expense' | 'income' | 'transfer'
  parent_id: number | null
  created_at: string
}

export interface CategoryInput {
  name: string
  kind?: Category['kind']
  parent_id?: number | null
}

export function listCategories(): Category[] {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all() as Category[]
}

export function createCategory(input: CategoryInput): Category {
  const { lastInsertRowid } = getDb()
    .prepare('INSERT INTO categories (name, kind, parent_id) VALUES (@name, @kind, @parent_id)')
    .run({
      name: input.name,
      kind: input.kind ?? 'expense',
      parent_id: input.parent_id ?? null
    })
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(lastInsertRowid) as Category
}
