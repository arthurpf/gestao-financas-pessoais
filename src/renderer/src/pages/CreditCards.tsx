import { Fragment, useEffect, useState, type FormEvent } from 'react'
import type { Account, CreditCardWithBalance } from '../types/ipc'

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const emptyForm = { name: '', limit: '', dueDay: '', bestPurchaseDay: '' }

export default function CreditCards({
  accounts,
  onChanged
}: {
  accounts: Account[]
  onChanged: () => void
}) {
  const [cards, setCards] = useState<CreditCardWithBalance[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [payingCardId, setPayingCardId] = useState<number | null>(null)
  const [payAccountId, setPayAccountId] = useState<number | ''>('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payError, setPayError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  async function load() {
    setCards(await window.api.creditCards.listWithBalance())
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(card: CreditCardWithBalance) {
    setEditingId(card.id)
    setForm({
      name: card.name,
      limit: (card.credit_limit_cents / 100).toString().replace('.', ','),
      dueDay: String(card.due_day),
      bestPurchaseDay: String(card.best_purchase_day)
    })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  async function handleDelete(id: number) {
    if (!confirm('Excluir este cartão de crédito?')) return
    await window.api.creditCards.delete(id)
    if (editingId === id) cancelEdit()
    await load()
    onChanged()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const parsedLimit = Number(form.limit.replace(',', '.'))
    const dueDay = Number(form.dueDay)
    const bestPurchaseDay = Number(form.bestPurchaseDay)

    if (!form.name.trim() || Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      setError('Preencha nome e limite (maior que zero).')
      return
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setError('Dia de vencimento deve estar entre 1 e 31.')
      return
    }
    if (!Number.isInteger(bestPurchaseDay) || bestPurchaseDay < 1 || bestPurchaseDay > 31) {
      setError('Melhor dia de compra deve estar entre 1 e 31.')
      return
    }

    const input = {
      name: form.name.trim(),
      credit_limit_cents: Math.round(parsedLimit * 100),
      due_day: dueDay,
      best_purchase_day: bestPurchaseDay
    }

    setSubmitting(true)
    try {
      if (editingId == null) {
        await window.api.creditCards.create(input)
      } else {
        await window.api.creditCards.update(editingId, input)
      }
      cancelEdit()
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function startPay(card: CreditCardWithBalance) {
    setPayingCardId(card.id)
    setPayAccountId(accounts[0]?.id ?? '')
    setPayAmount((card.balance_cents / 100).toString().replace('.', ','))
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayError(null)
  }

  function cancelPay() {
    setPayingCardId(null)
    setPayError(null)
  }

  async function handlePay(e: FormEvent) {
    e.preventDefault()
    setPayError(null)

    const parsedAmount = Number(payAmount.replace(',', '.'))
    if (!payAccountId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setPayError('Escolha a conta e informe um valor maior que zero.')
      return
    }
    if (payingCardId == null) return

    setPaying(true)
    try {
      await window.api.creditCards.payBill({
        credit_card_id: payingCardId,
        account_id: payAccountId,
        amount_cents: Math.round(parsedAmount * 100),
        date: payDate
      })
      cancelPay()
      await load()
      onChanged()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : String(err))
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Cartões de crédito</h2>
      </div>

      <form onSubmit={handleSubmit} className="card form" style={{ maxWidth: 480 }}>
        <h3>{editingId == null ? 'Novo cartão' : 'Editar cartão'}</h3>

        <label className="field">
          <span className="field-label">Nome</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>

        <label className="field">
          <span className="field-label">Limite de crédito (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={form.limit}
            onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
          />
        </label>

        <div className="form-row">
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Dia de vencimento (1–31)</span>
            <input
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))}
            />
          </label>

          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Melhor dia para comprar (1–31)</span>
            <input
              type="number"
              min={1}
              max={31}
              value={form.bestPurchaseDay}
              onChange={(e) => setForm((f) => ({ ...f, bestPurchaseDay: e.target.value }))}
            />
          </label>
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
            <button type="button" className="btn" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <section className="section">
        <h3>Meus cartões</h3>
        {cards.length === 0 ? (
          <p className="empty">Nenhum cartão cadastrado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="num">Fatura em aberto</th>
                  <th className="num">Limite</th>
                  <th className="num">Vencimento</th>
                  <th className="num">Melhor dia de compra</th>
                  <th className="actions">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => {
                  const usagePct = Math.min(
                    100,
                    Math.round((card.balance_cents / card.credit_limit_cents) * 100)
                  )
                  return (
                    <Fragment key={card.id}>
                      <tr className={editingId === card.id ? 'row-active' : undefined}>
                        <td className="cell-strong">{card.name}</td>
                        <td className="num">
                          <span className={`amount ${card.balance_cents > 0 ? 'is-negative' : ''}`}>
                            {centsToBRL(card.balance_cents)}
                          </span>
                          <div
                            className={`progress${usagePct >= 90 ? ' is-warning' : ''}`}
                            role="progressbar"
                            aria-label="Uso do limite"
                            aria-valuenow={usagePct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span style={{ width: `${usagePct}%` }} />
                          </div>
                        </td>
                        <td className="num">{centsToBRL(card.credit_limit_cents)}</td>
                        <td className="num">Dia {card.due_day}</td>
                        <td className="num">Dia {card.best_purchase_day}</td>
                        <td className="actions">
                          <button
                            className="btn btn-sm"
                            onClick={() => startPay(card)}
                            disabled={card.balance_cents <= 0}
                          >
                            Pagar fatura
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => startEdit(card)}>
                            Editar
                          </button>
                          <button
                            className="btn btn-sm btn-ghost btn-danger"
                            onClick={() => handleDelete(card.id)}
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                      {payingCardId === card.id && (
                        <tr className="row-detail">
                          <td colSpan={6}>
                            <form onSubmit={handlePay} className="form-row">
                              <label className="field">
                                <span className="field-label">Pagar com a conta</span>
                                <select
                                  value={payAccountId}
                                  onChange={(e) => setPayAccountId(Number(e.target.value))}
                                >
                                  {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                <span className="field-label">Valor (R$)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={payAmount}
                                  onChange={(e) => setPayAmount(e.target.value)}
                                  style={{ width: 130 }}
                                />
                              </label>
                              <label className="field">
                                <span className="field-label">Data</span>
                                <input
                                  type="date"
                                  value={payDate}
                                  onChange={(e) => setPayDate(e.target.value)}
                                />
                              </label>
                              <div className="form-actions" style={{ marginTop: 0 }}>
                                <button type="submit" className="btn btn-primary" disabled={paying}>
                                  {paying ? 'Pagando...' : 'Confirmar pagamento'}
                                </button>
                                <button type="button" className="btn" onClick={cancelPay}>
                                  Cancelar
                                </button>
                              </div>
                              {payError && (
                                <p className="alert alert--error" role="alert" style={{ width: '100%' }}>
                                  {payError}
                                </p>
                              )}
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
