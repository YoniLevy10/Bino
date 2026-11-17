/**
 * Default system expense categories (client-wide, project_id null).
 * Seeded on first categories GET when the client has none.
 */

export type DefaultExpenseCategory = {
  key: string
  name_he: string
  sort_order: number
}

export const DEFAULT_BUILDING_EXPENSE_CATEGORIES: DefaultExpenseCategory[] = [
  { key: 'cleaning', name_he: 'ניקיון', sort_order: 10 },
  { key: 'electricity', name_he: 'חשמל', sort_order: 20 },
  { key: 'plumbing', name_he: 'אינסטלציה', sort_order: 30 },
  { key: 'elevator', name_he: 'מעליות', sort_order: 40 },
  { key: 'gardening', name_he: 'גינון', sort_order: 50 },
  { key: 'insurance', name_he: 'ביטוח', sort_order: 60 },
  { key: 'management', name_he: 'ניהול', sort_order: 70 },
  { key: 'other', name_he: 'אחר', sort_order: 100 },
]

/** Build a valid category key from a display name (Hebrew → fallback id). */
export function categoryKeyFromName(nameHe: string, fallbackSuffix?: string): string {
  const ascii = nameHe
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30)
  if (ascii.length >= 2 && /^[a-z0-9_]{2,40}$/.test(ascii)) return ascii
  const suffix = (fallbackSuffix || Date.now().toString(36)).replace(/[^a-z0-9_]/gi, '').slice(0, 20)
  return `cat_${suffix || 'x'}`.slice(0, 40)
}
