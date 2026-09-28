/** Match residents for the single-charge picker (name / phone / apartment). */

export type ResidentSearchRow = {
  full_name: string
  apartment_number: string | null
  phone: string | null
  normalized_phone: string | null
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function phoneMatches(queryDigits: string, phoneDigits: string): boolean {
  if (!queryDigits || queryDigits.length < 3 || !phoneDigits) return false
  if (phoneDigits.includes(queryDigits)) return true
  // 05xxxxxxxx ↔ 9725xxxxxxxx
  if (queryDigits.startsWith('0') && phoneDigits.includes(`972${queryDigits.slice(1)}`)) {
    return true
  }
  if (queryDigits.startsWith('972') && phoneDigits.includes(`0${queryDigits.slice(3)}`)) {
    return true
  }
  return false
}

export function residentMatchesQuery(row: ResidentSearchRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false

  if (row.full_name.toLowerCase().includes(q)) return true
  if ((row.apartment_number || '').toLowerCase().includes(q)) return true
  if ((row.phone || '').toLowerCase().includes(q)) return true
  if ((row.normalized_phone || '').toLowerCase().includes(q)) return true

  const qDigits = digitsOnly(q)
  const phoneDigits = digitsOnly(`${row.normalized_phone || ''}${row.phone || ''}`)
  return phoneMatches(qDigits, phoneDigits)
}
