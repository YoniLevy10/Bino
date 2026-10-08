/** Fixly project `lfzxvmievofvdhxrwggo` — public API host, not a secret. */
export const DEFAULT_FIXLY_SUPABASE_URL = 'https://lfzxvmievofvdhxrwggo.supabase.co'

export const FIXLY_DIRECTORY_PAGE_SIZE = 40

export type FixlyDirectoryPerson = {
  id: string
  full_name: string
  phone: string
  email: string | null
  category: string | null
  city: string | null
  created_at: string
}

/** Strip PostgREST filter metacharacters. Hebrew letters and digits stay. */
export function sanitizeFixlyDirectoryQuery(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/[%_,().*\\'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function fixlyDirectoryOrFilter(raw: string | null | undefined): string | null {
  const q = sanitizeFixlyDirectoryQuery(raw)
  if (!q) return null
  return ['full_name', 'category', 'city', 'phone'].map((column) => `${column}.ilike.%${q}%`).join(',')
}

export function tradeFromFixlyCategory(category: string | null | undefined): string | null {
  const trade = category?.trim() ?? ''
  if (!trade) return null
  return trade.slice(0, 100)
}

export function notesFromFixlyPerson(person: { city?: string | null; category?: string | null }): string {
  const parts = ['מקור: מאגר Fixly']
  const city = person.city?.trim()
  if (city) parts.push(city)
  const category = person.category?.trim() ?? ''
  if (category.length > 100) parts.push(category.slice(0, 500))
  return parts.join(' · ').slice(0, 2000)
}
