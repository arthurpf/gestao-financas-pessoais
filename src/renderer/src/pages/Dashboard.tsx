import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart,
  BarChart,
  LineChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import type {
  Account,
  CreditCard,
  MonthlySummaryRow,
  MonthlySummaryBySourceRow,
  CreditCardBalanceHistoryRow,
  Label,
  Transaction
} from '../types/ipc'
import MonthPicker from '../components/MonthPicker'
import LabelBadge from '../components/LabelBadge'

// Cores vêm de variáveis CSS (theme.css) para acompanhar o tema claro/escuro.
const PALETTE = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--chart-${n})`)

function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length]
}

function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Valores dos gráficos já estão em reais (centavos / 100).
function reaisToBRL(value: unknown): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
  const from = `${year}-${pad2(monthIndex0 + 1)}-01`
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate()
  const to = `${year}-${pad2(monthIndex0 + 1)}-${pad2(lastDay)}`
  return { from, to }
}

type ChartMode = 'overall' | 'stacked' | 'cards'

type SourceFilter = { kind: 'all' } | { kind: 'account'; id: number } | { kind: 'credit_card'; id: number }

function sourceFilterKey(f: SourceFilter): string {
  return f.kind === 'all' ? 'all' : `${f.kind}:${f.id}`
}

function parseSourceFilterKey(key: string): SourceFilter {
  if (key === 'all') return { kind: 'all' }
  const [kind, id] = key.split(':')
  return kind === 'account' ? { kind: 'account', id: Number(id) } : { kind: 'credit_card', id: Number(id) }
}

export default function Dashboard({ refreshKey }: { refreshKey: number }) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [chartMode, setChartMode] = useState<ChartMode>('overall')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>({ kind: 'all' })

  const [accounts, setAccounts] = useState<Account[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [summary, setSummary] = useState<MonthlySummaryRow[]>([])
  const [summaryBySource, setSummaryBySource] = useState<MonthlySummaryBySourceRow[]>([])
  const [balanceHistory, setBalanceHistory] = useState<CreditCardBalanceHistoryRow[]>([])
  const [statement, setStatement] = useState<Transaction[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [labelFilter, setLabelFilter] = useState<number | null>(null)

  const { from, to } = useMemo(() => monthRange(cursor.year, cursor.month), [cursor])

  useEffect(() => {
    window.api.accounts.list().then(setAccounts)
    window.api.creditCards.list().then(setCreditCards)
    window.api.labels.list().then((list) => {
      setLabels(list)
      // Etiqueta filtrada pode ter deixado de existir (ex.: dados apagados).
      setLabelFilter((current) => (current !== null && list.some((l) => l.id === current) ? current : null))
    })
  }, [refreshKey])

  useEffect(() => {
    window.api.transactions.monthlySummary().then(setSummary)
    window.api.transactions.monthlySummaryBySource().then(setSummaryBySource)
    window.api.creditCards.balanceHistory().then(setBalanceHistory)
  }, [refreshKey])

  useEffect(() => {
    window.api.transactions
      .list({
        from,
        to,
        limit: 1000,
        account_id: sourceFilter.kind === 'account' ? sourceFilter.id : undefined,
        credit_card_id: sourceFilter.kind === 'credit_card' ? sourceFilter.id : undefined,
        label_id: labelFilter ?? undefined
      })
      .then(setStatement)
  }, [refreshKey, from, to, sourceFilter, labelFilter])

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const overallChartData = summary.map((row) => ({
    month: row.month,
    Receitas: row.income_cents / 100,
    Despesas: row.expense_cents / 100,
    Diferença: row.difference_cents / 100
  }))

  const sourceNames = useMemo(() => {
    const names = new Set<string>()
    summaryBySource.forEach((row) => names.add(row.source_name))
    return Array.from(names)
  }, [summaryBySource])

  const stackedChartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>()
    for (const row of summaryBySource) {
      if (!byMonth.has(row.month)) byMonth.set(row.month, { month: row.month })
      const entry = byMonth.get(row.month)!
      entry[row.source_name] = row.expense_cents / 100
    }
    return Array.from(byMonth.values()).sort((a, b) =>
      String(a.month).localeCompare(String(b.month))
    )
  }, [summaryBySource])

  const cardNames = useMemo(() => new Map(creditCards.map((c) => [c.id, c.name])), [creditCards])

  const cardsChartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>()
    for (const row of balanceHistory) {
      if (!byMonth.has(row.month)) byMonth.set(row.month, { month: row.month })
      const entry = byMonth.get(row.month)!
      const name = cardNames.get(row.credit_card_id) ?? `Cartão ${row.credit_card_id}`
      entry[name] = row.balance_cents / 100
    }
    return Array.from(byMonth.values()).sort((a, b) =>
      String(a.month).localeCompare(String(b.month))
    )
  }, [balanceHistory, cardNames])

  const totals = statement.reduce(
    (acc, t) => {
      if (t.amount_cents > 0) acc.income += t.amount_cents
      else acc.expense += -t.amount_cents
      return acc
    },
    { income: 0, expense: 0 }
  )

  return (
    <div className="page">
      <section className="section">
        <div className="section-header">
          <h2>Resumo mensal</h2>
          <div className="segmented" role="group" aria-label="Tipo de gráfico">
            {(
              [
                ['overall', 'Geral'],
                ['stacked', 'Por fonte'],
                ['cards', 'Cartões']
              ] as [ChartMode, string][]
            ).map(([mode, label]) => (
              <button key={mode} aria-pressed={chartMode === mode} onClick={() => setChartMode(mode)}>
                {label}
              </button>
            ))}
          </div>
        </div>

      {chartMode === 'overall' &&
        (overallChartData.length === 0 ? (
          <p className="empty">Nenhum lançamento ainda. Adicione um lançamento para ver o gráfico.</p>
        ) : (
          <div className="card chart-card" style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <ComposedChart data={overallChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis width={90} tickFormatter={reaisToBRL} />
                <Tooltip formatter={(value) => reaisToBRL(value)} />
                <Legend />
                <Bar dataKey="Receitas" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Diferença" stroke="var(--chart-1)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ))}

      {chartMode === 'stacked' &&
        (stackedChartData.length === 0 ? (
          <p className="empty">Nenhum lançamento ainda.</p>
        ) : (
          <div className="card chart-card" style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={stackedChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis width={90} tickFormatter={reaisToBRL} />
                <Tooltip formatter={(value) => reaisToBRL(value)} />
                <Legend />
                {sourceNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="despesas" fill={colorFor(i)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}

      {chartMode === 'cards' &&
        (creditCards.length === 0 ? (
          <p className="empty">Nenhum cartão cadastrado ainda.</p>
        ) : cardsChartData.length === 0 ? (
          <p className="empty">Nenhum lançamento em cartões ainda.</p>
        ) : (
          <div className="card chart-card" style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={cardsChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis width={90} tickFormatter={reaisToBRL} />
                <Tooltip formatter={(value) => reaisToBRL(value)} />
                <Legend />
                {creditCards.map((card, i) => (
                  <Line
                    key={card.id}
                    type="monotone"
                    dataKey={card.name}
                    stroke={colorFor(i)}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
                {creditCards.map((card, i) => (
                  <ReferenceLine
                    key={`limit-${card.id}`}
                    y={card.credit_limit_cents / 100}
                    stroke={colorFor(i)}
                    strokeDasharray="4 4"
                    label={{ value: `Limite ${card.name}`, position: 'insideTopRight', fill: colorFor(i) }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Extrato</h2>
          <div className="toolbar-group">
            <button
              className="btn btn-icon"
              aria-label="Mês anterior"
              onClick={() => shiftMonth(-1)}
            >
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
          <select
            value={sourceFilterKey(sourceFilter)}
            onChange={(e) => setSourceFilter(parseSourceFilterKey(e.target.value))}
          >
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

      {statement.length === 0 ? (
        <p className="empty">Nenhum lançamento neste período.</p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((t) => (
                <tr key={t.id}>
                  <td className="cell-muted">{formatDate(t.date)}</td>
                  <td>
                    {t.description}
                    {t.labels.length > 0 && (
                      <div className="cell-labels">
                        {t.labels.map((l) => (
                          <LabelBadge key={l.id} name={l.name} color={l.color} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    <span className={`amount ${t.amount_cents < 0 ? 'is-negative' : 'is-positive'}`}>
                      {centsToBRL(t.amount_cents)}
                    </span>
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
