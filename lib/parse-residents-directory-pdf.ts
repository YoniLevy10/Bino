/**
 * Parse resident directory exports (tab-separated text extracted from PDF).
 *
 * Import rules:
 * - Primary occupant (שם) → resident row
 * - Spouse (בן זוג) with a name → second resident, same apartment
 * - שכירות rows: tenants marked is_renter; owner contact stored in notes
 * - Rows where שם is literally "שכירות" → tenant is in the next columns
 */

export type ParsedDirectoryResident = {
  project_name: string
  apartment_number: string
  full_name: string
  phone: string
  email: string
  is_renter: boolean
  notes: string
}

const HEADER_MARK = 'דירה\tשם'
const PAGE_MARK = /^-- \d+ of \d+ --$/

function cleanField(v: string): string {
  return v.replace(/\s+/g, ' ').trim()
}

function isEmailLike(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(v.trim())
}

function isPhoneLike(v: string): boolean {
  const t = v.trim()
  if (!t) return false
  if (isEmailLike(t)) return false
  const digits = t.replace(/\D/g, '')
  return digits.length >= 7
}

function normalizeProjectName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s+([א-ת])\s*$/u, '$1')
    .replace(/([0-9])\s+([א-ת])/gu, '$1$2')
    .trim()
    .toLowerCase()
}

/** Normalize project name for fuzzy DB matching. */
export function normalizeProjectNameForMatch(name: string): string {
  return normalizeProjectName(name)
    .replace(/["'`]/g, '')
    .replace(/\s*-\s*/g, ' ')
}

function isProjectHeaderLine(line: string): boolean {
  const t = line.trim()
  if (!t || PAGE_MARK.test(t) || t.startsWith('דירה\t')) return false
  if (/^\d/.test(t)) return false
  // Real building headers include a street number (מקור חיים 40א, בוזגלו 4, …).
  if (!/\d/.test(t)) return false
  // Owner/contact lines mis-extracted as headers: "Name\tphone"
  if (t.includes('\t')) {
    const afterTab = t.split('\t').slice(1).join('\t').trim()
    if (isPhoneLike(afterTab) || isEmailLike(afterTab)) return false
  }
  return true
}

function parseDataColumns(cols: string[]): {
  apartment: string
  primaryName: string
  primaryPhone: string
  primaryEmail: string
  spouseName: string
  spousePhone: string
  isRental: boolean
  ownerName: string
  ownerPhone: string
  ownerEmail: string
} {
  const c = cols.map((x) => x.trim())

  // Pattern: apt | שכירות | tenant name | tenant phone | ...
  if (c[1] === 'שכירות') {
    return {
      apartment: c[0],
      primaryName: c[2] || '',
      primaryPhone: c[3] || '',
      primaryEmail: isEmailLike(c[4] || '') ? c[4] : '',
      spouseName: '',
      spousePhone: '',
      isRental: true,
      ownerName: c[5] && !isPhoneLike(c[5]) && c[5] !== 'שכירות' ? c[5] : '',
      ownerPhone: isPhoneLike(c[5] || '') ? c[5] : isPhoneLike(c[6] || '') ? c[6] : '',
      ownerEmail: isEmailLike(c[6] || '') ? c[6] : isEmailLike(c[7] || '') ? c[7] : '',
    }
  }

  const rentalIdx = c.findIndex((x) => x === 'שכירות')
  const isRental = rentalIdx >= 0

  let ownerName = ''
  let ownerPhone = ''
  let ownerEmail = ''

  if (isRental && rentalIdx + 1 < c.length) {
    const after = c.slice(rentalIdx + 1)
    ownerName = after[0] || ''
    for (const field of after.slice(1)) {
      if (!field) continue
      if (!ownerPhone && isPhoneLike(field)) ownerPhone = field
      else if (!ownerEmail && isEmailLike(field)) ownerEmail = field
    }
  }

  let spouseName = c[4] || ''
  let spousePhone = c[5] || ''
  if (spouseName === 'שכירות') {
    spouseName = ''
    spousePhone = ''
  }
  if (spousePhone === 'שכירות') spousePhone = ''

  let primaryPhone = c[2] || ''
  let primaryEmail = c[3] || ''
  if (!isEmailLike(primaryEmail) && isEmailLike(primaryPhone)) {
    primaryEmail = primaryPhone
    primaryPhone = ''
  }
  if (!isEmailLike(primaryEmail)) primaryEmail = ''

  return {
    apartment: c[0],
    primaryName: c[1] || '',
    primaryPhone,
    primaryEmail,
    spouseName,
    spousePhone: isPhoneLike(spousePhone) ? spousePhone : '',
    isRental,
    ownerName,
    ownerPhone,
    ownerEmail,
  }
}

function ownerNotes(ownerName: string, ownerPhone: string, ownerEmail: string): string {
  const parts: string[] = []
  if (ownerName) parts.push(`בעל דירה: ${ownerName}`)
  if (ownerPhone) parts.push(`טלפון בעלים: ${ownerPhone}`)
  if (ownerEmail) parts.push(`אימייל בעלים: ${ownerEmail}`)
  return parts.join(' | ')
}

function pushResident(
  out: ParsedDirectoryResident[],
  projectName: string,
  apartment: string,
  fullName: string,
  phone: string,
  email: string,
  isRenter: boolean,
  notes: string
) {
  const name = cleanField(fullName)
  if (!name || name === 'שכירות') return

  out.push({
    project_name: projectName,
    apartment_number: cleanField(apartment),
    full_name: name,
    phone: cleanField(phone),
    email: cleanField(email),
    is_renter: isRenter,
    notes: cleanField(notes),
  })
}

export function parseResidentsDirectoryPdfText(text: string): ParsedDirectoryResident[] {
  const lines = text.split(/\r?\n/)
  const out: ParsedDirectoryResident[] = []
  let currentProject = ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue
    if (PAGE_MARK.test(line.trim())) continue
    if (line.startsWith(HEADER_MARK)) continue

    if (isProjectHeaderLine(line)) {
      currentProject = normalizeProjectName(line.trim())
      continue
    }

    if (!currentProject) continue
    if (!/^\d/.test(line.trim())) continue

    const cols = line.split('\t')
    if (cols.length < 2) continue

    const row = parseDataColumns(cols)
    if (!row.apartment) continue

    const ownerNote = row.isRental ? ownerNotes(row.ownerName, row.ownerPhone, row.ownerEmail) : ''

    pushResident(
      out,
      currentProject,
      row.apartment,
      row.primaryName,
      row.primaryPhone,
      row.primaryEmail,
      row.isRental,
      ownerNote
    )

    if (row.spouseName) {
      pushResident(
        out,
        currentProject,
        row.apartment,
        row.spouseName,
        row.spousePhone,
        '',
        row.isRental,
        row.spousePhone ? `בן/בת זוג של ${cleanField(row.primaryName)}` : `בן/בת זוג של ${cleanField(row.primaryName)}`
      )
    }
  }

  return out
}

export function groupResidentsByProject(
  residents: ParsedDirectoryResident[]
): Map<string, ParsedDirectoryResident[]> {
  const map = new Map<string, ParsedDirectoryResident[]>()
  for (const r of residents) {
    const list = map.get(r.project_name) || []
    list.push(r)
    map.set(r.project_name, list)
  }
  return map
}

export function matchProjectName(
  pdfName: string,
  dbNames: { id: string; name: string }[]
): { id: string; name: string } | null {
  const norm = normalizeProjectNameForMatch(pdfName)
  const exact = dbNames.find((p) => normalizeProjectNameForMatch(p.name) === norm)
  if (exact) return exact

  const loose = dbNames.find((p) => {
    const db = normalizeProjectNameForMatch(p.name)
    return db.includes(norm) || norm.includes(db)
  })
  return loose || null
}
