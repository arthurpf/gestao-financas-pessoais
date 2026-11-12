export const DEFAULT_LABEL_COLOR = '#6366f1'

const DARK_TEXT = '#111827'
const LIGHT_TEXT = '#ffffff'

/** Converte '#rgb' ou '#rrggbb' em '#rrggbb' minúsculo; devolve null se for inválido. */
export function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  let hex = m[1].toLowerCase()
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return `#${hex}`
}

/** Luminância relativa WCAG de uma cor '#rrggbb' (0 = preto, 1 = branco). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Cor de texto (escura ou branca) com maior contraste (WCAG) sobre o fundo `color`. */
export function readableTextColor(color: string): string {
  const hex = normalizeHex(color)
  if (!hex) return LIGHT_TEXT
  const bg = relativeLuminance(hex)
  const withLight = contrastRatio(bg, relativeLuminance(LIGHT_TEXT))
  const withDark = contrastRatio(bg, relativeLuminance(DARK_TEXT))
  return withDark >= withLight ? DARK_TEXT : LIGHT_TEXT
}
