import { getDb } from '../connection'

export interface Label {
  id: number
  name: string
  color: string // '#rrggbb'
  created_at: string
}

export interface LabelWithUsage extends Label {
  /** Quantidade de lançamentos que usam a etiqueta. */
  usage_count: number
}

export interface LabelInput {
  name: string
  color: string
}

function validate(input: LabelInput): { name: string; color: string } {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da etiqueta é obrigatório.')
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error('Cor inválida.')
  return { name, color: input.color.toLowerCase() }
}

function assertNameAvailable(name: string, exceptId?: number): void {
  const clash = getDb()
    .prepare('SELECT id FROM labels WHERE name = ? AND id != ?')
    .get(name, exceptId ?? -1)
  if (clash) throw new Error(`Já existe uma etiqueta chamada "${name}".`)
}

export function listLabels(): LabelWithUsage[] {
  return getDb()
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM transaction_labels tl WHERE tl.label_id = l.id) AS usage_count
       FROM labels l
       ORDER BY l.name COLLATE NOCASE`
    )
    .all() as LabelWithUsage[]
}

export function createLabel(input: LabelInput): Label {
  const { name, color } = validate(input)
  assertNameAvailable(name)
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO labels (name, color) VALUES (?, ?)')
    .run(name, color)
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(lastInsertRowid) as Label
}

export function updateLabel(id: number, input: LabelInput): Label {
  const { name, color } = validate(input)
  assertNameAvailable(name, id)
  const db = getDb()
  const { changes } = db
    .prepare('UPDATE labels SET name = ?, color = ? WHERE id = ?')
    .run(name, color, id)
  if (changes === 0) throw new Error('Etiqueta não encontrada.')
  return db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label
}

/** Exclui a etiqueta e a remove de todos os lançamentos (os lançamentos permanecem). */
export function deleteLabel(id: number): void {
  getDb().prepare('DELETE FROM labels WHERE id = ?').run(id)
}
