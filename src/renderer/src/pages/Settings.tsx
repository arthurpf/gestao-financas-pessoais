import { useState } from 'react'
import { getStoredTheme, saveTheme, type Theme } from '../theme'

const CONFIRM_WORD = 'APAGAR'

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: '☀️' },
  { value: 'dark', label: 'Escuro', icon: '🌙' }
]

export default function Settings({ onDataReset }: { onDataReset: () => Promise<void> | void }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function chooseTheme(next: Theme) {
    setTheme(next)
    saveTheme(next)
  }

  function cancelReset() {
    setConfirming(false)
    setConfirmText('')
  }

  async function handleReset() {
    if (confirmText !== CONFIRM_WORD) return
    setBusy(true)
    setMessage(null)
    try {
      await window.api.settings.resetAllData()
      await onDataReset()
      setMessage({ kind: 'ok', text: 'Todos os dados foram apagados.' })
      cancelReset()
    } catch (err) {
      setMessage({
        kind: 'error',
        text: `Não foi possível apagar os dados: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Configurações</h2>
      </div>

      <section className="card">
        <h3>Aparência</h3>
        <p className="text-muted">Escolha o tema da aplicação.</p>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={theme === opt.value}
              onClick={() => chooseTheme(opt.value)}
            >
              <span aria-hidden="true">{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card card--danger">
        <h3>Zona de perigo</h3>
        <p>
          Apaga permanentemente todas as contas, cartões, categorias e lançamentos. Esta ação não
          pode ser desfeita.
        </p>

        {!confirming ? (
          <button
            className="btn btn-danger"
            onClick={() => {
              setMessage(null)
              setConfirming(true)
            }}
          >
            Apagar todos os dados
          </button>
        ) : (
          <div>
            <p style={{ fontWeight: 600 }}>
              Tem certeza? Digite <code>{CONFIRM_WORD}</code> para confirmar.
            </p>
            <div className="toolbar" style={{ alignItems: 'center' }}>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReset()
                  if (e.key === 'Escape') cancelReset()
                }}
                placeholder={CONFIRM_WORD}
                aria-label={`Digite ${CONFIRM_WORD} para confirmar`}
                disabled={busy}
              />
              <button
                className="btn btn-danger"
                onClick={handleReset}
                disabled={busy || confirmText !== CONFIRM_WORD}
              >
                {busy ? 'Apagando…' : 'Confirmar e apagar'}
              </button>
              <button className="btn" onClick={cancelReset} disabled={busy}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {message && (
          <p
            className={`alert ${message.kind === 'ok' ? 'alert--success' : 'alert--error'}`}
            style={{ marginTop: 'var(--space-3)' }}
          >
            {message.text}
          </p>
        )}
      </section>
    </div>
  )
}
