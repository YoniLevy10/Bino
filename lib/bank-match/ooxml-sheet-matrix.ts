/**
 * Lightweight first-sheet OOXML reader via JSZip.
 * Handles namespaced worksheets (x:row / x:c) that ExcelJS fails to load.
 */

import JSZip from 'jszip'

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

/** Excel serial day → YYYY-MM-DD (UTC calendar day). */
export function excelSerialToIsoDate(serial: number): string {
  const d = new Date(EXCEL_EPOCH_UTC + Math.round(serial) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function colLettersToIndex(ref: string): number {
  const m = ref.match(/^([A-Za-z]+)/)
  if (!m) return 0
  let n = 0
  for (const ch of m[1].toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return Math.max(0, n - 1)
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  // <si>…<t>…</t>…</si> (optional namespace)
  const siRe = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    const tMatch = m[1].match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/)
    out.push(tMatch ? decodeXmlEntities(tMatch[1]) : '')
  }
  return out
}

function cellValue(
  cellXml: string,
  shared: string[]
): string | number | null {
  const tMatch = cellXml.match(/\bt="([^"]+)"/)
  const type = tMatch?.[1] || ''
  const vMatch = cellXml.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)
  const isMatch = cellXml.match(/<(?:\w+:)?is\b[^>]*>[\s\S]*?<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/)
  if (type === 'inlineStr' || type === 'str') {
    if (isMatch) return decodeXmlEntities(isMatch[1])
    if (vMatch) return decodeXmlEntities(vMatch[1])
    return ''
  }
  if (type === 's' && vMatch) {
    const idx = Number(vMatch[1])
    return Number.isFinite(idx) ? shared[idx] ?? '' : ''
  }
  if (vMatch) {
    const raw = vMatch[1].trim()
    if (raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : decodeXmlEntities(raw)
  }
  return null
}

/**
 * Read first worksheet into a dense matrix (row-major).
 * Dates that are Excel serials stay numeric — caller converts by header.
 */
export async function parseOoxmlFirstSheetMatrix(
  bytes: Buffer | Uint8Array
): Promise<unknown[][]> {
  const zip = await JSZip.loadAsync(bytes)
  const sheetEntry =
    zip.file('xl/worksheets/sheet1.xml') ||
    zip.file(/xl\/worksheets\/sheet\d+\.xml$/i)[0]
  if (!sheetEntry) {
    throw new Error('לא נמצא גיליון Excel בקובץ')
  }
  const sheetXml = await sheetEntry.async('string')
  const sharedEntry = zip.file('xl/sharedStrings.xml')
  const shared = sharedEntry
    ? parseSharedStrings(await sharedEntry.async('string'))
    : []

  const rowRe = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g
  const matrix: unknown[][] = []
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const rowInner = rowMatch[1]
    const cells: Array<{ col: number; value: string | number | null }> = []
    const cellRe = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>|<(?:\w+:)?c\b([^>]*)\/>/g
    let cMatch: RegExpExecArray | null
    while ((cMatch = cellRe.exec(rowInner))) {
      const attrs = cMatch[1] || cMatch[3] || ''
      const body = cMatch[2] || ''
      const refMatch = attrs.match(/\br="([A-Z]+\d+)"/i)
      const col = refMatch ? colLettersToIndex(refMatch[1]) : cells.length
      const value = cellValue(`<c ${attrs}>${body}</c>`, shared)
      cells.push({ col, value })
    }
    if (cells.length === 0) {
      matrix.push([])
      continue
    }
    const width = Math.max(...cells.map((c) => c.col)) + 1
    const row: unknown[] = Array.from({ length: width }, () => '')
    for (const c of cells) {
      row[c.col] = c.value === null ? '' : c.value
    }
    matrix.push(row)
  }
  return matrix
}

/** Convert Excel serials in date-like header columns to ISO dates. */
export function normalizeExcelDateColumns(matrix: unknown[][]): unknown[][] {
  if (matrix.length === 0) return matrix
  const header = matrix[0].map((h) => String(h ?? '').toLowerCase().replace(/\s+/g, ''))
  const dateCols = header
    .map((h, i) =>
      h.includes('תאריך') || h.includes('date') || h.includes('ערך') ? i : -1
    )
    .filter((i) => i >= 0)

  if (dateCols.length === 0) return matrix

  return matrix.map((row, ri) => {
    if (ri === 0) return row
    const next = [...row]
    for (const ci of dateCols) {
      const v = next[ci]
      if (typeof v === 'number' && v > 20000 && v < 80000) {
        next[ci] = excelSerialToIsoDate(v)
      }
    }
    return next
  })
}
