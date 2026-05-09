/**
 * מספר לקישור wa.me — ספרות בלבד, בלי +.
 * תומך ב־0XXXXXXXXX או 972XXXXXXXXX.
 */
export function digitsForWaMeLink(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const d = s.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('972')) return d
  if (d.startsWith('0')) return `972${d.slice(1)}`
  if (d.length >= 9 && d.length <= 10 && !d.startsWith('972')) {
    return `972${d.replace(/^0+/, '')}`
  }
  return d
}
