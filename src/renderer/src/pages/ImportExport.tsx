import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type {
  Account,
  BackupCounts,
  BackupExportResult,
  Category,
  CreditCard,
  ImportResult
} from '../types/ipc'
import { countBackupRecords, looksLikeBackup } from '../lib/backup'
import {
  DELIMITERS,
  decodeCsvBuffer,
  detectDelimiter,
  extractSepDirective,
  parseCsv,
  type DateFormat,
  type Delimiter,
  type NumberFormat
} from '../lib/csv'
import {
  EMPTY_MAPPING,
  FIELDS,
  guessMapping,
  prepareRows,
  type FieldKey,
  type ImportSettings,
  type Mapping
} from '../lib/csvImport'

const PREVIEW_LIMIT = 20

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

interface LoadedFile {
  name: string
  text: string
}

/** Backup (gerado por "Exportar") carregado e aguardando a confirmação da restauração. */
interface LoadedBackup {
  name: string
  rows: string[][]
  counts: BackupCounts
}

function describeCounts(c: BackupCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return [
    plural(c.accounts, 'conta', 'contas'),
    plural(c.credit_cards, 'cartão', 'cartões'),
    plural(c.categories, 'categoria', 'categorias'),
    plural(c.labels, 'etiqueta', 'etiquetas'),
    plural(c.transactions, 'lançamento', 'lançamentos')
  ].join(', ')
}

export default function ImportExport({
  accounts,
  creditCards,
  onImported,
  onRestored
}: {
  accounts: Account[]
  creditCards: CreditCard[]
  onImported: () => void
  onRestored: () => Promise<void> | void
}) {
  const [categories, setCategories] = useState<Category[]>([])
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [delimiter, setDelimiter] = useState<Delimiter>(';')
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING)

  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy')
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('auto')
  const [invertSign, setInvertSign] = useState(false)
  const [defaultAccountId, setDefaultAccountId] = useState<number | null>(accounts[0]?.id ?? null)
  const [createMissingCategories, setCreateMissingCategories] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<BackupExportResult | null>(null)
  const [backup, setBackup] = useState<LoadedBackup | null>(null)
  const [confirmingRestore, setConfirmingRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState<BackupCounts | null>(null)

  useEffect(() => {
    window.api.categories.list().then(setCategories)
  }, [])

  // A conta padrão é sempre a primeira da lista, a menos que o usuário escolha outra.
  useEffect(() => {
    if (accounts.length === 0) return
    if (defaultAccountId === null || !accounts.some((a) => a.id === defaultAccountId)) {
      setDefaultAccountId(accounts[0].id)
    }
  }, [accounts, defaultAccountId])

  const rows = useMemo(() => (file ? parseCsv(file.text, delimiter) : []), [file, delimiter])
  const columnCount = rows[0]?.length ?? 0
  const headers = useMemo(
    () =>
      hasHeader && rows[0]
        ? rows[0].map((h, i) => h.trim() || `Coluna ${i + 1}`)
        : Array.from({ length: columnCount }, (_, i) => `Coluna ${i + 1}`),
    [rows, hasHeader, columnCount]
  )
  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader])

  // Sugere o mapeamento quando o arquivo, o delimitador ou o cabeçalho mudam.
  useEffect(() => {
    setMapping(hasHeader ? guessMapping(headers) : EMPTY_MAPPING)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, delimiter, hasHeader])

  const settings: ImportSettings = {
    dateFormat,
    numberFormat,
    invertSign,
    defaultAccountId,
    createMissingCategories
  }
  const prepared = useMemo(
    () => prepareRows(dataRows, mapping, settings, { accounts, creditCards, categories }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataRows, mapping, dateFormat, numberFormat, invertSign, defaultAccountId, createMissingCategories, accounts, creditCards, categories]
  )

  const requiredMissing = FIELDS.filter((f) => f.required && mapping[f.key] === null)
  const validRows = prepared.filter((r) => r.payload)
  const invalidCount = prepared.length - validRows.length
  const warningCount = prepared.filter((r) => r.payload && r.warnings.length > 0).length
  const visibleRows = (onlyProblems
    ? prepared.filter((r) => r.errors.length > 0 || r.warnings.length > 0)
    : prepared
  ).slice(0, PREVIEW_LIMIT)

  const mappedColumns = new Set(Object.values(mapping).filter((v): v is number => v !== null))
  const ignoredColumns = headers.filter((_, i) => !mappedColumns.has(i))

  function sampleFor(key: FieldKey): string {
    const index = mapping[key]
    if (index === null) return ''
    return dataRows.map((r) => r[index]?.trim()).find((v) => v) ?? ''
  }

  async function handleExport() {
    setError(null)
    setExported(null)
    setExporting(true)
    try {
      setExported(await window.api.backup.exportAll())
    } catch (err) {
      setError(`Não foi possível exportar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  function discardBackup() {
    setBackup(null)
    setConfirmingRestore(false)
  }

  async function handleRestore() {
    if (!backup) return
    setError(null)
    setRestoring(true)
    try {
      const counts = await window.api.backup.restore(backup.rows)
      discardBackup()
      setRestored(counts)
      await onRestored()
      window.api.categories.list().then(setCategories)
    } catch (err) {
      setError(`Não foi possível restaurar: ${err instanceof Error ? err.message : String(err)}`)
      setConfirmingRestore(false)
    } finally {
      setRestoring(false)
    }
  }

  async function loadFile(f: File) {
    setError(null)
    setResult(null)
    setRestored(null)
    setBackup(null)
    setConfirmingRestore(false)
    try {
      const decoded = decodeCsvBuffer(await f.arrayBuffer())
      const { text, delimiter: declared } = extractSepDirective(decoded)
      if (text.trim() === '') {
        setError('O arquivo está vazio.')
        return
      }
      const detected = declared ?? detectDelimiter(text)

      // Um backup gerado por "Exportar" segue outro fluxo: restaura a base inteira.
      const backupRows = parseCsv(text, detected)
      if (looksLikeBackup(backupRows)) {
        setFile(null)
        if (fileInput.current) fileInput.current.value = ''
        setBackup({ name: f.name, rows: backupRows, counts: countBackupRecords(backupRows) })
        return
      }

      setDelimiter(detected)
      setHasHeader(true)
      setFile({ name: f.name, text })
    } catch (err) {
      setError(`Não foi possível ler o arquivo: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) loadFile(dropped)
  }

  function reset() {
    setFile(null)
    setMapping(EMPTY_MAPPING)
    setError(null)
    setResult(null)
    setInvertSign(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleImport() {
    setError(null)
    setBusy(true)
    try {
      const payloads = validRows.map((r) => r.payload!)
      const outcome = await window.api.transactions.importBatch(payloads, {
        skip_duplicates: skipDuplicates
      })
      setResult(outcome)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      if (outcome.categories_created > 0) window.api.categories.list().then(setCategories)
      onImported()
    } catch (err) {
      setError(`Não foi possível importar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const canImport = file !== null && requiredMissing.length === 0 && validRows.length > 0 && !busy

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Importar/Exportar</h2>
          <p className="page-subtitle">
            Exporte todos os seus dados em CSV (backup ou para usar em outro computador) e
            importe lançamentos de outras fontes ou um backup anterior.
          </p>
        </div>
      </div>

      <section className="card">
        <h3>Exportar todos os dados</h3>
        <p className="text-muted">
          Gera um único arquivo CSV com contas, cartões de crédito, categorias, etiquetas e todos
          os lançamentos. Para usar em outro computador, instale o aplicativo lá e importe este
          arquivo na seção abaixo.
        </p>
        <div className="toolbar-group">
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando…' : 'Exportar para CSV'}
          </button>
        </div>
        {exported && (
          <p className="alert alert--success" role="status" style={{ marginTop: 'var(--space-3)' }}>
            <strong>Dados exportados</strong> ({describeCounts(exported.counts)}) em{' '}
            <code>{exported.path}</code>.
          </p>
        )}
      </section>

      {restored && (
        <div className="alert alert--success" role="status">
          <strong>Backup restaurado.</strong> {describeCounts(restored)}.
        </div>
      )}

      {result && (
        <div className="alert alert--success" role="status">
          <strong>
            {result.inserted} {result.inserted === 1 ? 'lançamento importado' : 'lançamentos importados'}.
          </strong>
          {result.skipped_duplicates > 0 &&
            ` ${result.skipped_duplicates} já existiam e foram ignorados.`}
          {result.categories_created > 0 &&
            ` ${result.categories_created} ${result.categories_created === 1 ? 'categoria criada' : 'categorias criadas'}.`}
        </div>
      )}

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h3>Importar — 1. Arquivo</h3>
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            id="csv-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) loadFile(f)
            }}
          />
          {file ? (
            <p>
              <strong>{file.name}</strong> — {dataRows.length}{' '}
              {dataRows.length === 1 ? 'linha' : 'linhas'} de dados
            </p>
          ) : (
            <p className="text-muted">
              Arraste um arquivo CSV aqui ou escolha no computador. Pode ser um extrato com
              lançamentos ou um backup gerado por "Exportar para CSV".
            </p>
          )}
          <div className="toolbar-group">
            <label htmlFor="csv-file" className="btn btn-primary" style={{ cursor: 'pointer' }}>
              {file ? 'Trocar arquivo' : 'Escolher arquivo'}
            </label>
            {file && (
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Limpar
              </button>
            )}
          </div>
        </div>

        {file && (
          <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
            <label className="field">
              <span className="field-label">Separador de colunas</span>
              <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
                {DELIMITERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              A primeira linha é o cabeçalho
            </label>
          </div>
        )}
      </section>

      {backup && (
        <section className="card card--danger">
          <h3>Restaurar backup</h3>
          <p>
            <strong>{backup.name}</strong> é um backup completo com {describeCounts(backup.counts)}.
          </p>
          <p>
            Restaurar <strong>substitui todos os dados atuais</strong> por estes. Esta ação não pode
            ser desfeita — se tiver dados que queira manter, exporte-os antes.
          </p>
          {!confirmingRestore ? (
            <div className="toolbar-group">
              <button className="btn btn-danger" onClick={() => setConfirmingRestore(true)}>
                Restaurar backup
              </button>
              <button className="btn" onClick={discardBackup}>
                Cancelar
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontWeight: 600 }}>
                Tem certeza? Os dados atuais serão apagados e substituídos pelo backup.
              </p>
              <div className="toolbar-group">
                <button className="btn btn-danger" onClick={handleRestore} disabled={restoring}>
                  {restoring ? 'Restaurando…' : 'Sim, substituir tudo'}
                </button>
                <button className="btn" onClick={() => setConfirmingRestore(false)} disabled={restoring}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {file && columnCount > 0 && (
        <>
          <section className="card">
            <h3>2. Mapeamento de colunas</h3>
            <p className="text-muted">
              Para cada campo do sistema, escolha a coluna do CSV correspondente. Colunas não
              escolhidas são ignoradas.
            </p>

            <div className="mapping-grid" role="table" aria-label="Mapeamento de colunas">
              <div className="mapping-head" role="row">
                <span role="columnheader">Campo do sistema</span>
                <span role="columnheader">Coluna do CSV</span>
                <span role="columnheader">Exemplo</span>
              </div>
              {FIELDS.map((f) => (
                <div className="mapping-row" role="row" key={f.key}>
                  <div role="cell">
                    <label htmlFor={`map-${f.key}`} className="cell-strong">
                      {f.label}
                      {f.required && (
                        <span className="text-negative" title="Obrigatório">
                          {' '}
                          *
                        </span>
                      )}
                    </label>
                    <div className="text-muted mapping-hint">{f.hint}</div>
                  </div>
                  <div role="cell">
                    <select
                      id={`map-${f.key}`}
                      value={mapping[f.key] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [f.key]: e.target.value === '' ? null : Number(e.target.value)
                        }))
                      }
                      style={{ width: '100%' }}
                    >
                      <option value="">— Não importar —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div role="cell" className="cell-muted mapping-sample">
                    {sampleFor(f.key) || '—'}
                  </div>
                </div>
              ))}
            </div>

            {ignoredColumns.length > 0 && (
              <p className="text-muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
                Colunas ignoradas:{' '}
                {ignoredColumns.map((h) => (
                  <span className="badge" key={h} style={{ marginRight: 4 }}>
                    {h}
                  </span>
                ))}
              </p>
            )}
            {requiredMissing.length > 0 && (
              <p className="alert alert--error" style={{ marginTop: 'var(--space-3)' }}>
                Mapeie os campos obrigatórios: {requiredMissing.map((f) => f.label).join(', ')}.
              </p>
            )}
          </section>

          <section className="card">
            <h3>3. Opções de interpretação</h3>
            <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
              <label className="field">
                <span className="field-label">Formato da data</span>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                >
                  <option value="dmy">Dia/Mês/Ano (31/12/2026)</option>
                  <option value="mdy">Mês/Dia/Ano (12/31/2026)</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Formato dos números</span>
                <select
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                >
                  <option value="auto">Automático</option>
                  <option value="br">1.234,56 (vírgula decimal)</option>
                  <option value="us">1,234.56 (ponto decimal)</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Conta padrão (quando a linha não informa)</span>
                <select
                  value={defaultAccountId ?? ''}
                  onChange={(e) => setDefaultAccountId(Number(e.target.value))}
                >
                  {accounts.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {i === 0 ? ' (primeira da lista)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="check-list">
              <label className="check">
                <input
                  type="checkbox"
                  checked={invertSign}
                  onChange={(e) => setInvertSign(e.target.checked)}
                />
                Inverter o sinal dos valores (use se as despesas vierem como valores positivos)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={createMissingCategories}
                  onChange={(e) => setCreateMissingCategories(e.target.checked)}
                />
                Criar categorias que ainda não existem
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                Ignorar lançamentos já importados anteriormente
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <h3>4. Pré-visualização</h3>
              <div className="toolbar-group">
                <span className="badge badge--success">{validRows.length} válidas</span>
                {warningCount > 0 && (
                  <span className="badge badge--warning">{warningCount} com aviso</span>
                )}
                {invalidCount > 0 && (
                  <span className="badge badge--danger">{invalidCount} com erro (serão ignoradas)</span>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(e) => setOnlyProblems(e.target.checked)}
                  />
                  Só com problemas
                </label>
              </div>
            </div>

            {requiredMissing.length > 0 ? (
              <div className="empty">Mapeie Data e Valor para ver a pré-visualização.</div>
            ) : visibleRows.length === 0 ? (
              <div className="empty">Nenhuma linha para exibir.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Conta / Cartão</th>
                      <th>Categoria</th>
                      <th className="num">Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.line}>
                        <td className="cell-muted">{r.line}</td>
                        <td className="cell-muted">{formatDate(r.view.date)}</td>
                        <td>{r.view.description || <span className="text-muted">—</span>}</td>
                        <td>{r.view.target || <span className="text-muted">—</span>}</td>
                        <td>{r.view.category || <span className="text-muted">—</span>}</td>
                        <td className="num">
                          {r.view.amountCents === null ? (
                            '—'
                          ) : (
                            <span
                              className={`amount ${r.view.amountCents >= 0 ? 'is-positive' : 'is-negative'}`}
                            >
                              {formatBRL(r.view.amountCents)}
                            </span>
                          )}
                        </td>
                        <td>
                          {r.errors.length > 0 ? (
                            <span className="text-negative">{r.errors.join('; ')}</span>
                          ) : r.warnings.length > 0 ? (
                            <span style={{ color: 'var(--warning)' }}>{r.warnings.join('; ')}</span>
                          ) : (
                            <span className="badge badge--success">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {prepared.length > PREVIEW_LIMIT && (
              <p className="text-muted" style={{ margin: 0 }}>
                Exibindo as primeiras {PREVIEW_LIMIT} linhas
                {onlyProblems ? ' com problemas' : ''} de {onlyProblems ? invalidCount + warningCount : prepared.length}.
              </p>
            )}
          </section>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={!canImport} onClick={handleImport}>
              {busy
                ? 'Importando…'
                : `Importar ${validRows.length} ${validRows.length === 1 ? 'lançamento' : 'lançamentos'}`}
            </button>
            <button className="btn" onClick={reset} disabled={busy}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
