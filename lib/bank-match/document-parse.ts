/**
 * Unified bank-statement document → normalized transactions.
 * Supports CSV/TSV text, Excel (.xlsx), and PDF (text extraction + heuristics).
 */

import { createHash } from 'crypto'
import { parseBankCsvText } from '@/lib/bank-match/csv-parse'
import type { NormalizedBankTransaction } from '@/lib/bank-match/types'
import { parseWorkbookToMatrix } from '@/lib/excel-workbook'
import {
  normalizeExcelDateColumns,
  parseOoxmlFirstSheetMatrix,
} from '@/lib/bank-match/ooxml-sheet-matrix'

export type DocumentParseResult = {
  rows: NormalizedBankTransaction[]
  errors: string[]
  format: 'csv' | 'excel' | 'pdf' | 'unknown'
}

function matrixToCsvText(matrix: unknown[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? '' : String(cell)
          if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
          return s
        })
        .join(',')
    )
    .join('\n')
}

function guessExt(fileName: string, mime?: string | null): string {
  const n = (fileName || '').toLowerCase()
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) return 'csv'
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'excel'
  if (n.endsWith('.pdf')) return 'pdf'
  const m = (mime || '').toLowerCase()
  if (m.includes('csv') || m.includes('text/plain') || m.includes('tab-separated')) return 'csv'
  if (m.includes('spreadsheet') || m.includes('excel')) return 'excel'
  if (m.includes('pdf')) return 'pdf'
  return 'unknown'
}

/**
 * PDF bank demos / exports often emit tab-separated rows:
 * date \t value-date \t description \t signed-amount \t balance \t reference \t …
 */
export function parseBankStatementTabLines(
  text: string,
  projectId: string
): { rows: NormalizedBankTransaction[]; errors: string[] } {
  const errors: string[] = []
  const rows: NormalizedBankTransaction[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.includes('\t')) continue
    const cells = line.split('\t').map((c) => c.trim())
    if (cells.length < 4) continue
    // Skip header
    if (/תאריך|date/i.test(cells[0]) && /תיאור|description/i.test(cells.join(' '))) {
      continue
    }
    if (!/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(cells[0])) {
      continue
    }

    // Prefer a signed amount cell (not balance): look for ±amount among cols 2..n-1
    let amountIdx = -1
    let amountNum: number | null = null
    for (let c = 2; c < cells.length; c++) {
      const raw = cells[c].replace(/[₪,\s]/g, '').replace(/[—–−]/g, '-')
      if (!/^[-+]?\d+(?:\.\d+)?$/.test(raw)) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n === 0) continue
      // Prefer first signed/non-balance-looking number after description
      amountIdx = c
      amountNum = n
      break
    }
    if (amountNum === null || amountIdx < 0) continue

    const bookedRaw = cells[0]
    let booked_at: string | null = null
    if (/^\d{4}-\d{2}-\d{2}/.test(bookedRaw)) booked_at = bookedRaw.slice(0, 10)
    else {
      const m = bookedRaw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
      if (m) {
        const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
        booked_at = `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }
    }

    // Skip optional value-date column when present (demo PDF / bank layouts).
    let descStart = 1
    if (
      cells.length > 3 &&
      /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(cells[1])
    ) {
      descStart = 2
    }
    const description =
      cells.slice(descStart, amountIdx).join(' ').replace(/\s+/g, ' ').trim() || null
    // Reference often after balance: SIM-… / BINO-…
    let reference: string | null = null
    for (let c = amountIdx + 1; c < cells.length; c++) {
      if (/^SIM[-_]?\w+/i.test(cells[c]) || /^BINO[-_]?\w+/i.test(cells[c])) {
        reference = cells[c]
        break
      }
      if (/^[A-Z]{2,}\d+$/i.test(cells[c])) {
        reference = cells[c]
        break
      }
    }

    const direction: 'credit' | 'debit' = amountNum < 0 ? 'debit' : 'credit'
    const amount = Math.abs(amountNum)
    const skBase = [
      booked_at || '',
      amount.toFixed(2),
      direction,
      (description || '').slice(0, 80),
      (reference || '').slice(0, 40),
    ].join('|')
    rows.push({
      project_id: projectId,
      booked_at,
      amount,
      currency: 'ILS',
      direction,
      description,
      reference,
      counterparty: null,
      external_sk: `doc:${createHash('sha256').update(skBase).digest('hex').slice(0, 24)}`,
      source: 'csv',
    })
  }

  if (rows.length === 0) {
    errors.push('לא זוהו שורות מופרדות בטאב במסמך ה־PDF')
  }
  return { rows, errors }
}

/**
 * Heuristic: Israeli bank PDF lines often look like
 * DD/MM/YYYY  description…  amount  or credit/debit columns.
 */
export function parseBankStatementTextLines(
  text: string,
  projectId: string
): { rows: NormalizedBankTransaction[]; errors: string[] } {
  // Prefer structured tab rows when present (common in generated demos / some exports)
  if (text.includes('\t')) {
    const tabbed = parseBankStatementTabLines(text, projectId)
    if (tabbed.rows.length > 0) return tabbed
  }

  const errors: string[] = []
  const rows: NormalizedBankTransaction[] = []
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const dateRe = /^(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/
  const amountRe = /([-+]?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const dm = line.match(dateRe)
    if (!dm) continue
    const am = line.match(amountRe)
    if (!am) continue
    const amountRaw = am[1].replace(/,/g, '')
    const amountNum = Number(amountRaw)
    if (!Number.isFinite(amountNum) || amountNum === 0) continue

    let booked_at: string | null = null
    const d = dm[1]
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) booked_at = d.slice(0, 10)
    else {
      const m = d.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
      if (m) {
        const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
        booked_at = `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }
    }

    const mid = line.slice(dm[0].length, line.length - am[0].length).trim()
    const description = mid || null
    const direction: 'credit' | 'debit' = amountNum < 0 ? 'debit' : 'credit'
    const amount = Math.abs(amountNum)
    const skBase = [booked_at || '', amount.toFixed(2), direction, (description || '').slice(0, 80)].join(
      '|'
    )
    rows.push({
      project_id: projectId,
      booked_at,
      amount,
      currency: 'ILS',
      direction,
      description,
      reference: null,
      counterparty: null,
      external_sk: `doc:${createHash('sha256').update(skBase).digest('hex').slice(0, 24)}`,
      source: 'csv',
    })
  }

  if (rows.length === 0) {
    errors.push('לא זוהו תנועות בטקסט המסמך. נסו CSV/Excel מהבנק או PDF עם טקסט ברור.')
  }
  return { rows, errors }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return String((result as { text?: string }).text || '')
  } finally {
    const maybe = parser as { destroy?: () => Promise<void> }
    if (typeof maybe.destroy === 'function') await maybe.destroy()
  }
}

async function excelBytesToMatrix(buf: Buffer, fileName: string): Promise<unknown[][]> {
  try {
    const matrix = await parseWorkbookToMatrix(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      { fileName, maxBytes: 8 * 1024 * 1024 }
    )
    if (matrix.length > 0) return normalizeExcelDateColumns(matrix)
  } catch {
    // Fall through — some exporters use namespaced OOXML ExcelJS cannot open
  }
  const matrix = await parseOoxmlFirstSheetMatrix(buf)
  return normalizeExcelDateColumns(matrix)
}

export async function parseBankDocument(params: {
  projectId: string
  fileName?: string | null
  mimeType?: string | null
  /** Raw file bytes, or omit when csvText is provided. */
  bytes?: Buffer | Uint8Array | null
  csvText?: string | null
}): Promise<DocumentParseResult> {
  const { projectId, fileName, mimeType, csvText } = params
  const ext = guessExt(fileName || '', mimeType)

  if (csvText && csvText.trim() && (ext === 'csv' || ext === 'unknown' || !params.bytes)) {
    const parsed = parseBankCsvText(csvText, projectId)
    if (parsed.rows.length > 0) {
      return { ...parsed, format: 'csv' }
    }
    const heuristic = parseBankStatementTextLines(csvText, projectId)
    return { ...heuristic, format: 'csv' }
  }

  if (!params.bytes || params.bytes.byteLength === 0) {
    return { rows: [], errors: ['לא התקבל תוכן קובץ'], format: 'unknown' }
  }

  const buf = Buffer.isBuffer(params.bytes)
    ? params.bytes
    : Buffer.from(params.bytes)

  if (ext === 'excel' || (ext === 'unknown' && fileName?.toLowerCase().endsWith('.xlsx'))) {
    try {
      const matrix = await excelBytesToMatrix(buf, fileName || 'statement.xlsx')
      const asCsv = matrixToCsvText(matrix)
      const parsed = parseBankCsvText(asCsv, projectId)
      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        return {
          rows: [],
          errors: ['קובץ Excel ריק או ללא תנועות'],
          format: 'excel',
        }
      }
      return { ...parsed, format: 'excel' }
    } catch (e) {
      return {
        rows: [],
        errors: [e instanceof Error ? e.message : 'קריאת Excel נכשלה'],
        format: 'excel',
      }
    }
  }

  if (ext === 'pdf') {
    try {
      const text = await extractPdfText(buf)
      if (!text.trim()) {
        return {
          rows: [],
          errors: ['PDF ללא טקסט ניתן לחילוץ (ייתכן סריקה בלבד). נסו CSV/Excel.'],
          format: 'pdf',
        }
      }
      // Prefer CSV-shaped extraction if PDF contains tabular export text
      const asCsv = parseBankCsvText(text, projectId)
      if (asCsv.rows.length > 0) return { ...asCsv, format: 'pdf' }
      const heuristic = parseBankStatementTextLines(text, projectId)
      return { ...heuristic, format: 'pdf' }
    } catch (e) {
      return {
        rows: [],
        errors: [e instanceof Error ? e.message : 'קריאת PDF נכשלה'],
        format: 'pdf',
      }
    }
  }

  // Unknown binary — try UTF-8 as CSV
  const text = buf.toString('utf8')
  const parsed = parseBankCsvText(text, projectId)
  if (parsed.rows.length > 0) return { ...parsed, format: 'csv' }
  const heuristic = parseBankStatementTextLines(text, projectId)
  const format: DocumentParseResult['format'] =
    ext === 'csv' || ext === 'excel' || ext === 'pdf' ? ext : 'unknown'
  return { ...heuristic, format }
}
