import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Account, CreditCard, Label, Transaction } from '../types/ipc'
import { readableTextColor } from '../lib/color'
import LabelBadge from '../components/LabelBadge'
import MonthPicker from '../components/MonthPicker'
import PageHeader from '../components/PageHeader'

type Direction = 'expense' | 'income'
type SourceKind = 'account' | 'credit_card'
type SourceFilter = 'all' | `account:${number}` | `credit_card:${number}`

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function monthRange(year: number, monthIndex0: number): { from: string; to: string } {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate()
  return {
    from: `${year}-${pad2(monthIndex0 + 1)}-01`,
    to: `${year}-${pad2(monthIndex0 + 1)}-${pad2(lastDay)}`
  }
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Aceita "12,50", "12.50" e "1.234,56". Retorna NaN se não for um número. */
function parseAmount(text: string): number {
  const t = text.trim().replace(/\s/g, '')
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return normalized === '' ? NaN : Number(normalized)
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  csv: 'Importado',
  card_payment: 'Pagamento de fatura'
}

export default function Transactions({
  accounts,
  creditCards,
  refreshKey,
  onChanged
}: {
  accounts: Account[]
  creditCards: CreditCard[]
  refreshKey: number
  onChanged: () => void
}) {
  // --- Listagem ---------------------------------------------------------------
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [labelFilter, setLabelFilter] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [labels, setLabels] = useState<Label[]>([])

  const { from, to } = useMemo(() => monthRange(cursor.year, cursor.month), [cursor])

  const load = useCallback(async () => {
    const [kind, id] = sourceFilter.split(':')
    setTransactions(
      await window.api.transactions.list({
        from,
        to,
        limit: 1000,
        account_id: kind === 'account' ? Number(id) : undefined,
        credit_card_id: kind === 'credit_card' ? Number(id) : undefined,
        label_id: labelFilter ?? undefined
      })
    )
  }, [from, to, sourceFilter, labelFilter])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    window.api.labels.list().then((list) => {
      setLabels(list)
      setLabelFilter((current) => (current !== null && list.some((l) => l.id === current) ? current : null))
    })
  }, [refreshKey])

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const cardNames = useMemo(() => new Map(creditCards.map((c) => [c.id, c.name])), [creditCards])

  function sourceName(t: Transaction): string {
    if (t.account_id !== null) return accountNames.get(t.account_id) ?? `Conta #${t.account_id}`
    if (t.credit_card_id !== null) return cardNames.get(t.credit_card_id) ?? `Cartão #${t.credit_card_id}`
    return '—'
  }

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.amount_cents > 0) acc.income += t.amount_cents
      else acc.expense += -t.amount_cents
      return acc
    },
    { income: 0, expense: 0 }
  )

  // --- Formulário (criar / editar) --------------------------------------------
  // O formulário é uma subtela: enquanto aberto, substitui a listagem (que mantém mês e filtros).
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [sourceKind, setSourceKind] = useState<SourceKind>('account')
  const [accountId, setAccountId] = useState<number | ''>(accounts[0]?.id ?? '')
  const [creditCardId, setCreditCardId] = useState<number | ''>(creditCards[0]?.id ?? '')
  const [direction, setDirection] = useState<Direction>('expense')
  const [date, setDate] = useState(todayISO)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (accountId === '' && accounts[0]) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  useEffect(() => {
    if (creditCardId === '' && creditCards[0]) setCreditCardId(creditCards[0].id)
  }, [creditCards, creditCardId])

  function resetForm() {
    setEditing(null)
    setSourceKind('account')
    setAccountId(accounts[0]?.id ?? '')
    setCreditCardId(creditCards[0]?.id ?? '')
    setDirection('expense')
    setDate(todayISO())
    setAmount('')
    setDescription('')
    setSelectedLabelIds([])
    setError(null)
  }

  function openNew() {
    resetForm()
    setFormOpen(true)
  }

  function closeForm() {
    resetForm()
    setFormOpen(false)
  }

  function startEdit(t: Transaction) {
    setEditing(t)
    setSourceKind(t.credit_card_id !== null ? 'credit_card' : 'account')
    setAccountId(t.account_id ?? accounts[0]?.id ?? '')
    setCreditCardId(t.credit_card_id ?? creditCards[0]?.id ?? '')
    setDirection(t.amount_cents < 0 ? 'expense' : 'income')
    setDate(t.date)
    setAmount((Math.abs(t.amount_cents) / 100).toFixed(2).replace('.', ','))
    setDescription(t.description)
    setSelectedLabelIds(t.labels.map((l) => l.id))
    setError(null)
    setFormOpen(true)
  }

  function toggleLabel(id: number) {
    setSelectedLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const sourceId = sourceKind === 'account' ? accountId : creditCardId
    const parsedAmount = parseAmount(amount)
    if (!sourceId || Number.isNaN(parsedAmount) || parsedAmount <= 0 || !description.trim() || !date) {
      setError('Preencha a fonte, data, valor (maior que zero) e descrição.')
      return
    }

    const input = {
      account_id: sourceKind === 'account' ? sourceId : null,
      credit_card_id: sourceKind === 'credit_card' ? sourceId : null,
      date,
      amount_cents: Math.round(parsedAmount * 100) * (direction === 'expense' ? -1 : 1),
      description: description.trim(),
      label_ids: selectedLabelIds
    }

    setSubmitting(true)
    try {
      if (editing) await window.api.transactions.update(editing.id, input)
      else await window.api.transactions.create(input)
      closeForm()
      onChanged() // atualiza a lista (via refreshKey) e o Dashboard
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(t: Transaction) {
    const extra =
      t.source === 'card_payment'
        ? '\n\nEste lançamento faz parte de um pagamento de fatura; a outra metade (na conta ou no cartão) não será excluída.'
        : ''
    if (
      !confirm(
        `Excluir o lançamento "${t.description}" de ${formatDate(t.date)} (${centsToBRL(t.amount_cents)})?\nEsta ação não pode ser desfeita.${extra}`
      )
    ) {
      return
    }
    try {
      await window.api.transactions.delete(t.id)
      if (editing?.id === t.id) closeForm()
      onChanged()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  if (formOpen) {
    const formTitle = editing ? 'Editar lançamento' : 'Novo lançamento'
    return (
      <div className="page">
        <PageHeader
          title={formTitle}
          breadcrumbs={[{ label: 'Lançamentos', onClick: closeForm }, { label: formTitle }]}
        />

        <form onSubmit={handleSubmit} className="card form" style={{ maxWidth: 480 }}>
          <fieldset className="field">
            <legend>Tipo</legend>
            <div className="segmented" style={{ alignSelf: 'flex-start' }}>
              <label>
                <input
                  type="radio"
                  name="direction"
                  checked={direction === 'expense'}
                  onChange={() => setDirection('expense')}
                />
                Despesa
              </label>
              <label>
                <input
                  type="radio"
                  name="direction"
                  checked={direction === 'income'}
                  onChange={() => setDirection('income')}
                />
                Receita
              </label>
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Fonte</legend>
            <div className="segmented" style={{ alignSelf: 'flex-start' }}>
              <label>
                <input
                  type="radio"
                  name="source-kind"
                  checked={sourceKind === 'account'}
                  onChange={() => setSourceKind('account')}
                />
                Conta
              </label>
              <label>
                <input
                  type="radio"
                  name="source-kind"
                  checked={sourceKind === 'credit_card'}
                  onChange={() => setSourceKind('credit_card')}
                  disabled={creditCards.length === 0}
                />
                Cartão de crédito
              </label>
            </div>
          </fieldset>

          {sourceKind === 'account' ? (
            <label className="field">
              <span className="field-label">Conta</span>
              <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Cartão</span>
              <select value={creditCardId} onChange={(e) => setCreditCardId(Number(e.target.value))}>
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Valor (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Descrição</span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <fieldset className="field">
            <legend>Etiquetas</legend>
            {labels.length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>
                Nenhuma etiqueta cadastrada. Crie etiquetas na página Etiquetas.
              </p>
            ) : (
              <div className="chip-list" role="group" aria-label="Etiquetas do lançamento">
                {labels.map((l) => {
                  const selected = selectedLabelIds.includes(l.id)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="chip"
                      aria-pressed={selected}
                      onClick={() => toggleLabel(l.id)}
                      style={
                        selected
                          ? { background: l.color, borderColor: l.color, color: readableTextColor(l.color) }
                          : { borderColor: l.color }
                      }
                    >
                      {l.name}
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar'}
            </button>
            <button type="button" className="btn" onClick={closeForm}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Lançamentos"
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + Novo lançamento
          </button>
        }
      />

      <section className="section">
        <div className="section-header">
          <h3>Lançamentos do mês</h3>
          <div className="toolbar-group">
            <button className="btn btn-icon" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
              &larr;
            </button>
            <MonthPicker
              year={cursor.year}
              month={cursor.month}
              onChange={(year, month) => setCursor({ year, month })}
            />
            <button className="btn btn-icon" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
              &rarr;
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
            >
              Hoje
            </button>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat stat--income">
            <div className="stat-label">Receitas</div>
            <div className="stat-value">{centsToBRL(totals.income)}</div>
          </div>
          <div className="stat stat--expense">
            <div className="stat-label">Despesas</div>
            <div className="stat-value">{centsToBRL(totals.expense)}</div>
          </div>
          <div className="stat stat--balance">
            <div className="stat-label">Diferença</div>
            <div className="stat-value">{centsToBRL(totals.income - totals.expense)}</div>
          </div>
        </div>

        <div className="toolbar">
          <label className="field" style={{ width: 300 }}>
            <span className="field-label">Fonte</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="all">Todas as contas e cartões</option>
              {accounts.length > 0 && (
                <optgroup label="Contas">
                  {accounts.map((a) => (
                    <option key={`account-${a.id}`} value={`account:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {creditCards.length > 0 && (
                <optgroup label="Cartões">
                  {creditCards.map((c) => (
                    <option key={`credit_card-${c.id}`} value={`credit_card:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="field" style={{ width: 220 }}>
            <span className="field-label">Etiqueta</span>
            <select
              value={labelFilter ?? ''}
              onChange={(e) => setLabelFilter(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Todas as etiquetas</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {transactions.length === 0 ? (
          <p className="empty">Nenhum lançamento neste período.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Fonte</th>
                  <th className="num">Valor</th>
                  <th className="actions">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className={editing?.id === t.id ? 'row-active' : undefined}>
                    <td className="cell-muted">{formatDate(t.date)}</td>
                    <td>
                      {t.description}
                      {t.source !== 'manual' && (
                        <>
                          {' '}
                          <span className="badge">{SOURCE_LABELS[t.source] ?? t.source}</span>
                        </>
                      )}
                      {t.labels.length > 0 && (
                        <div className="cell-labels">
                          {t.labels.map((l) => (
                            <LabelBadge key={l.id} name={l.name} color={l.color} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="cell-muted">{sourceName(t)}</td>
                    <td className="num">
                      <span className={`amount ${t.amount_cents < 0 ? 'is-negative' : 'is-positive'}`}>
                        {centsToBRL(t.amount_cents)}
                      </span>
                    </td>
                    <td className="actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => startEdit(t)}>
                        Editar
                      </button>
                      <button className="btn btn-sm btn-ghost btn-danger" onClick={() => handleDelete(t)}>
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
