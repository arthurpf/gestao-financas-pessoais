import { useEffect, useRef, useState } from 'react'

const MONTH_ABBR = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez'
]

function monthLabel(year: number, monthIndex0: number): string {
  const label = new Date(year, monthIndex0, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function MonthPicker({
  year,
  month,
  onChange
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setViewYear(year)
  }, [open, year])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        style={{ minWidth: 168 }}
      >
        {monthLabel(year, month)} ▾
      </button>

      {open && (
        <div className="popover">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8
            }}
          >
            <button
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Ano anterior"
              onClick={() => setViewYear((y) => y - 1)}
            >
              &larr;
            </button>
            <strong>{viewYear}</strong>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Próximo ano"
              onClick={() => setViewYear((y) => y + 1)}
            >
              &rarr;
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6
            }}
          >
            {MONTH_ABBR.map((label, idx) => {
              const isSelected = viewYear === year && idx === month
              return (
                <button
                  key={label}
                  className={isSelected ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(viewYear, idx)
                    setOpen(false)
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
