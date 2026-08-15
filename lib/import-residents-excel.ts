import * as XLSX from 'xlsx'

export type ParsedRow = Record<string, unknown>

export type ResidentsColumnMapping = {
  project_code?: string
  project_name?: string
  full_name: string
  phone?: string
  apartment_number?: string
  ownership_type?: string
  ownership_percent?: string
  notes?: string
}

const HEADER_HINTS = [
  /שם/i,
  /טלפון/i,
  /phone/i,
  /דירה/i,
  /apartment/i,
  /הערות/i,
  /notes/i,
  /בניין/i,
  /פרויקט/i,
  /project/i,
  /אימייל/i,
  /email/i,
  /מייל/i,
  /בעלות/i,
  /ownership/i,
  /חלוקה/i,
  /distribution/i,
]

const TITLE_ROW_HINTS = [/רשימת/i, /דוח/i, /דיירים\s+בבניין/i]

const BUILDING_HEADER = /בניין|פרויקט|project|building/i

export function normalizeImportHeader(h: unknown): string {
  return (typeof h === 'string' ? h : h == null ? '' : String(h)).trim()
}

function scoreHeaderRow(cells: unknown[]): number {
  const texts = cells.map((c) => normalizeImportHeader(c)).filter(Boolean)
  if (texts.length < 2) return 0

  let score = 0
  for (const text of texts) {
    const lower = text.toLowerCase()
    if (HEADER_HINTS.some((rx) => rx.test(lower))) score += 2
    if (text.length > 40) score -= 3
    if (TITLE_ROW_HINTS.some((rx) => rx.test(text))) score -= 2
  }
  return score
}

/** SheetJS-style unique keys when Excel has repeated headers (שם, טלפון, מייל ×2–3). */
export function uniqueImportHeaderNames(cells: unknown[]): string[] {
  const counts = new Map<string, number>()
  return cells.map((cell, i) => {
    const base = normalizeImportHeader(cell) || `__EMPTY_${i}`
    const n = counts.get(base) ?? 0
    counts.set(base, n + 1)
    return n === 0 ? base : `${base}_${n}`
  })
}

/** Common management-company sheet: דירה | שם | טלפון | מייל | שם | טלפון | … */
export function isDirectoryStyleHeaderRow(cells: unknown[]): boolean {
  const h = cells.map((c) => normalizeImportHeader(c).toLowerCase())
  if (h.length < 4) return false
  const col0 = h[0]
  const col1 = h[1] || ''
  const col2 = h[2] || ''
  return (
    (col0 === 'דירה' || col0 === 'apartment') &&
    (col1 === 'שם' || col1.startsWith('שם')) &&
    (col2.includes('טלפון') || col2 === 'phone')
  )
}

export function findResidentsHeaderRowIndex(matrix: unknown[][]): number {
  const scan = Math.min(matrix.length, 15)
  let bestIdx = 0
  let bestScore = -1

  for (let i = 0; i < scan; i++) {
    const score = scoreHeaderRow(matrix[i] || [])
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  return bestIdx
}

export function matrixToResidentRows(matrix: unknown[][], headerRowIdx: number): ParsedRow[] {
  const headers = uniqueImportHeaderNames(matrix[headerRowIdx] || [])
  const rows: ParsedRow[] = []

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] || []
    const obj: ParsedRow = {}
    let hasAny = false

    for (let c = 0; c < headers.length; c++) {
      const val = cells[c] ?? ''
      if (val !== '' && val != null) hasAny = true
      obj[headers[c]] = val
    }

    if (hasAny) rows.push(obj)
  }

  return rows
}

export function inferResidentHeaders(rows: ParsedRow[]): string[] {
  return Array.from(
    new Set(rows.flatMap((r) => Object.keys(r).map((k) => normalizeImportHeader(k))).filter(Boolean))
  )
}

export function guessResidentsColumnKey(
  headers: string[],
  candidates: RegExp[],
  exclude?: RegExp
): string {
  for (const rx of candidates) {
    for (const header of headers) {
      if (exclude?.test(header)) continue
      if (rx.test(header)) return header
    }
  }
  return ''
}

export function guessResidentsColumnMapping(
  headers: string[],
  headerCells?: unknown[]
): ResidentsColumnMapping {
  if (headerCells && isDirectoryStyleHeaderRow(headerCells)) {
    const unique = uniqueImportHeaderNames(headerCells)
    return {
      full_name: unique[1] || '',
      phone: unique[2] || undefined,
      apartment_number: unique[0] || undefined,
      ownership_type: undefined,
      ownership_percent: undefined,
      notes: undefined,
      project_code: undefined,
      project_name: undefined,
    }
  }

  const guessedFullName = guessResidentsColumnKey(
    headers,
    [/^שם\s*מלא$/i, /^שם\s*דייר$/i, /^name$/i, /full.?name/i, /^שם$/i, /שם/i],
    BUILDING_HEADER
  )
  const guessedPhone = guessResidentsColumnKey(headers, [
    /^טלפון$/i,
    /^phone$/i,
    /טלפון/i,
    /phone/i,
  ])
  const guessedApt = guessResidentsColumnKey(headers, [/^דירה$/i, /apartment/i, /דירה/])
  const guessedNotes = guessResidentsColumnKey(headers, [/notes/i, /הערות/])
  const guessedOwnershipType = guessResidentsColumnKey(headers, [
    /סוג\s*בעלות/,
    /ownership.?type/i,
    /^בעלות$/,
    /חלוקה/,
    /distribution/i,
  ])
  const guessedOwnershipPercent = guessResidentsColumnKey(headers, [
    /אחוז\s*בעלות/,
    /ownership.?percent/i,
    /אחוז/,
    /percent/i,
  ])
  const guessedProjectCode = guessResidentsColumnKey(headers, [
    /project.?code/i,
    /קוד.*(פרויקט|בניין)/,
    /קוד/,
  ])
  const guessedProjectName = guessResidentsColumnKey(headers, [
    /^שם\s*בניין$/i,
    /project/i,
    /בניין/,
  ])

  return {
    full_name: guessedFullName || headers[0] || '',
    phone: guessedPhone || undefined,
    apartment_number: guessedApt || undefined,
    ownership_type: guessedOwnershipType || undefined,
    ownership_percent: guessedOwnershipPercent || undefined,
    notes: guessedNotes || undefined,
    project_code: guessedProjectCode || undefined,
    project_name: guessedProjectName || undefined,
  }
}

export function parseResidentsWorkbook(buffer: ArrayBuffer): {
  rows: ParsedRow[]
  headers: string[]
  mapping: ResidentsColumnMapping
} {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const headerRowIdx = findResidentsHeaderRowIndex(matrix)
  const headerCells = matrix[headerRowIdx] || []
  const rows = matrixToResidentRows(matrix, headerRowIdx)
  const headers = uniqueImportHeaderNames(headerCells).filter((h) => !h.startsWith('__EMPTY_'))
  const mapping = guessResidentsColumnMapping(headers, headerCells)

  return { rows, headers, mapping }
}

export function sanitizeImportPhone(raw: string) {
  const trimmed = raw.replace(/\s|-/g, '')
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  return hasPlus ? `+${digits}` : digits
}

export type ResidentsImportPayloadRow = {
  full_name: string
  phone: string
  apartment_number: string
  ownership_type: string
  ownership_percent: string
  notes: string
  project_code: string | null
  project_name: string | null
}

export function buildResidentsImportPayload(
  rows: ParsedRow[],
  mapping: ResidentsColumnMapping,
  options: {
    forcedProjectCode?: string | null
    forcedProjectName?: string | null
  } = {}
): ResidentsImportPayloadRow[] {
  const { forcedProjectCode = null, forcedProjectName = null } = options

  return rows
    .map((r) => {
      const phoneRaw = mapping.phone ? String(r[mapping.phone] ?? '').trim() : ''
      const rawName = mapping.full_name ? String(r[mapping.full_name] ?? '').trim() : ''
      const fullName = rawName || sanitizeImportPhone(phoneRaw) || ''
      const apt = mapping.apartment_number ? String(r[mapping.apartment_number] ?? '').trim() : ''
      const ownershipType = mapping.ownership_type
        ? String(r[mapping.ownership_type] ?? '').trim()
        : ''
      const ownershipPercent = mapping.ownership_percent
        ? String(r[mapping.ownership_percent] ?? '').trim()
        : ''
      const notes = mapping.notes ? String(r[mapping.notes] ?? '').trim() : ''

      const projectCode =
        forcedProjectCode ||
        (mapping.project_code ? String(r[mapping.project_code] ?? '').trim() : '')
      const projectName =
        forcedProjectName ||
        (mapping.project_name ? String(r[mapping.project_name] ?? '').trim() : '')

      return {
        full_name: fullName,
        phone: phoneRaw ? sanitizeImportPhone(phoneRaw) : '',
        apartment_number: apt,
        ownership_type: ownershipType,
        ownership_percent: ownershipPercent,
        notes,
        project_code: projectCode || null,
        project_name: projectName || null,
      }
    })
    .filter((row) => row.full_name || row.phone || row.apartment_number)
}
