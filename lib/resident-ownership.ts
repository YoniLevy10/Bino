/** סוג בעלות / חלוקה — מקבילה ל-CRM ניהול דיירים (GetStatus וכד׳) */
export const RESIDENT_OWNERSHIP_TYPES = [
  'בעלים',
  'שוכר',
  'משותף',
  'מיופה כוח',
  'דייר מוגן',
  'אחר',
] as const

export type ResidentOwnershipType = (typeof RESIDENT_OWNERSHIP_TYPES)[number]

export function parseOwnershipPercent(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampOwnershipPercent(raw)
  }
  const cleaned = String(raw)
    .replace(/%/g, '')
    .replace(/,/g, '.')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return clampOwnershipPercent(n)
}

function clampOwnershipPercent(n: number): number | null {
  if (n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

export function normalizeOwnershipType(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()
  return s ? s.slice(0, 80) : null
}
