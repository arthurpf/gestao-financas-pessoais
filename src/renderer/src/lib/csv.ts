/** Utilitários puros para ler CSV e interpretar datas e valores de fontes diversas. */

export type Delimiter = ',' | ';' | '\t' | '|'
export type DateFormat = 'dmy' | 'mdy'
export type NumberFormat = 'auto' | 'br' | 'us'

export const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ';', label: 'Ponto e vírgula ( ; )' },
  { value: ',', label: 'Vírgula ( , )' },
  { value: '\t', label: 'Tabulação' },
  { value: '|', label: 'Barra vertical ( | )' }
]

/** Decodifica o arquivo como UTF-8; se não for válido, assume Windows-1252 (comum em bancos BR). */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer)
  }
  return text.replace(/^﻿/, '')
}

/** Remove a linha opcional `sep=;` (gerada pelo Excel) e devolve o delimitador indicado nela. */
export function extractSepDirective(text: string): { text: string; delimiter: Delimiter | null } {
  const match = /^sep=(.)\r?\n/i.exec(text)
  if (!match) return { text, delimiter: null }
  const candidate = match[1] === '\\t' ? '\t' : match[1]
  const known = DELIMITERS.some((d) => d.value === candidate)
  return { text: text.slice(match[0].length), delimiter: known ? (candidate as Delimiter) : null }
}

export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 5)
  if (lines.length === 0) return ','

  let best: Delimiter = ','
  let bestScore = 0
  for (const { value } of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, value))
    const score = Math.min(...counts)
    if (score > bestScore) {
      bestScore = score
      best = value
    }
  }
  return best
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false
  let count = 0
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === delimiter && !inQuotes) count++
  }
  return count
}

/** Parser CSV (RFC 4180): aspas, aspas escapadas (""), quebras de linha dentro de campos. */
export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        field += ch
      }
      i++
      continue
    }

    if (ch === '"' && field === '') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
    i++
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  const width = nonEmpty.reduce((max, r) => Math.max(max, r.length), 0)
  return nonEmpty.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))
}

/** Minúsculas, sem acentos e sem espaços nas pontas — para comparar nomes e cabeçalhos. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * Converte um texto monetário em centavos. Aceita "R$ 1.234,56", "1,234.56", "-12,5",
 * "(12,50)", "12,50-" etc. Retorna null se não for um valor numérico.
 */
export function parseAmountToCents(raw: string, format: NumberFormat = 'auto'): number | null {
  let s = raw.trim()
  if (!s) return null

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[^\d.,+-]/g, '')
  if (s.includes('-')) negative = true
  s = s.replace(/[+-]/g, '')
  if (!/\d/.test(s)) return null

  let normalized: string
  if (format === 'br') {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else if (format === 'us') {
    normalized = s.replace(/,/g, '')
  } else {
    normalized = normalizeAuto(s)
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null

  const [intPart, fracPart = ''] = normalized.split('.')
  let cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0').slice(0, 2))
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) cents += 1
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

function normalizeAuto(s: string): string {
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  if (lastDot !== -1 && lastComma !== -1) {
    // Os dois aparecem: o que vem por último é o separador decimal.
    return lastDot > lastComma
      ? s.replace(/,/g, '')
      : s.replace(/\./g, '').replace(',', '.')
  }

  const sep = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : null
  if (!sep) return s

  const parts = s.split(sep)
  const looksLikeThousands =
    parts.length > 2 || (parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0]))
  if (looksLikeThousands) return parts.join('')
  return parts.join('.')
}

/**
 * Converte uma data em 'YYYY-MM-DD'. Sempre aceita AAAA-MM-DD / AAAA/MM/DD / AAAAMMDD
 * (com hora opcional); para formatos com o ano no fim, `format` define a ordem dia/mês.
 */
export function parseDate(raw: string, format: DateFormat = 'dmy'): string | null {
  const s = raw.trim()
  if (!s) return null

  let year: number
  let month: number
  let day: number

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) {
    ;[year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\D.*)?$/.exec(s)
    if (!m) return null
    const [a, b] = [Number(m[1]), Number(m[2])]
    ;[day, month] = format === 'dmy' ? [a, b] : [b, a]
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  }

  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
