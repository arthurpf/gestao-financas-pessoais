import { useEffect, useState, type FormEvent } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import type { LabelWithUsage } from '../types/ipc'
import LabelBadge from '../components/LabelBadge'
import { DEFAULT_LABEL_COLOR, normalizeHex } from '../lib/color'

const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280']

export default function Labels({ onChanged }: { onChanged: () => void }) {
  const [labels, setLabels] = useState<LabelWithUsage[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_LABEL_COLOR)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLabels(await window.api.labels.list())
  }

  useEffect(() => {
    load()
  }, [])

  function reset() {
    setEditingId(null)
    setName('')
    setColor(DEFAULT_LABEL_COLOR)
    setError(null)
  }

  function startEdit(label: LabelWithUsage) {
    setEditingId(label.id)
    setName(label.name)
    setColor(label.color)
    setError(null)
  }

  async function handleDelete(label: LabelWithUsage) {
    const extra =
      label.usage_count > 0
        ? ` Ela será removida de ${label.usage_count} lançamento(s); os lançamentos não serão excluídos.`
        : ''
    if (!confirm(`Excluir a etiqueta "${label.name}"?${extra}`)) return
    await window.api.labels.delete(label.id)
    if (editingId === label.id) reset()
    await load()
    onChanged()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Informe o nome da etiqueta.')
      return
    }

    setSubmitting(true)
    try {
      // O campo hex aceita atalhos como "#fff"; o banco guarda sempre '#rrggbb'.
      const input = { name: name.trim(), color: normalizeHex(color) ?? DEFAULT_LABEL_COLOR }
      if (editingId == null) await window.api.labels.create(input)
      else await window.api.labels.update(editingId, input)
      reset()
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Etiquetas</h2>
      </div>

      <form onSubmit={handleSubmit} className="card form" style={{ maxWidth: 480 }}>
        <h3>{editingId == null ? 'Nova etiqueta' : 'Editar etiqueta'}</h3>

        <label className="field">
          <span className="field-label">Nome</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="field">
          <span className="field-label">Cor</span>
          <div className="color-picker">
            <HexColorPicker color={color} onChange={setColor} />
            <div className="color-picker-side">
              <div className="chip-list">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="swatch"
                    style={{ background: s }}
                    aria-label={`Usar cor ${s}`}
                    aria-pressed={color.toLowerCase() === s}
                    onClick={() => setColor(s)}
                  />
                ))}
              </div>
              <HexColorInput color={color} onChange={setColor} prefixed aria-label="Código da cor" />
              <div>
                <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                  Pré-visualização:{' '}
                </span>
                <LabelBadge name={name.trim() || 'Etiqueta'} color={color} />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : editingId == null ? 'Adicionar' : 'Salvar alterações'}
          </button>
          {editingId != null && (
            <button type="button" className="btn" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <section className="section">
        <h3>Minhas etiquetas</h3>
        {labels.length === 0 ? (
          <p className="empty">Nenhuma etiqueta cadastrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Etiqueta</th>
                  <th className="num">Lançamentos</th>
                  <th className="actions">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {labels.map((l) => (
                  <tr key={l.id} className={editingId === l.id ? 'row-active' : undefined}>
                    <td>
                      <LabelBadge name={l.name} color={l.color} />
                    </td>
                    <td className="num">{l.usage_count}</td>
                    <td className="actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(l)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => handleDelete(l)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
