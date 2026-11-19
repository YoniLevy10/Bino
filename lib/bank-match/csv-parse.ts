/**
 * Parse Israeli bank export CSV / simple Excel-exported CSV into normalized rows.
 * Column detection is heuristic (Hebrew + English headers).
 */

import type { NormalizedBankTransaction } from '@/lib/bank-match/types'
import { createHash } from 'crypto'

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '')
}

/** Minimal CSV splitter supporting quoted fields. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && ch === sep) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function detectSeparator(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length
  const semis = (headerLine.match(/;/g) || []).length
  const tabs = (headerLine.match(/\t/g) || []).length
  if (tabs >= commas && tabs >= semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

function parseAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/[₪\s]/g, '')
    .replace(/\((.*)\)/, '-$1')
    .replace(/,/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  // DD/MM/YYYY or DD.MM.YYYY
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    let yyyy = m[3]
    if (yyyy.length === 2) yyyy = `20${yyyy}`
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

type ColMap = {
  date?: number
  amount?: number
  credit?: number
  debit?: number
  description?: number
  reference?: number
  counterparty?: number
}

function mapHeaders(headers: string[]): ColMap {
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, ''))
  const find = (...keys: string[]) => {
    for (let i = 0; i < norm.length; i++) {
      for (const k of keys) {
        if (norm[i].includes(k)) return i
      }
    }
    return undefined
  }
  // Prefer an explicit booking date column over "יום ערך" / value-date.
  const date =
    find('תאריךעסקה', 'תאריךרישום', 'bookingdate', 'booked') ??
    (() => {
      const idx = find('תאריך', 'date', 'valuedate', 'booking')
      if (idx === undefined) return undefined
      // If header is only "יום ערך", keep looking for a plain תאריך.
      if (norm[idx].includes('ערך') && !norm[idx].includes('תאריך')) {
        return find('תאריך') ?? idx
      }
      return idx
    })()

  const credit = find('זכות', 'credit', 'הפקדה')
  const debit = find('חובה', 'debit', 'משיכה')
  // Israeli exports often use one signed column "זכות/חובה" — same index for both.
  const signedCombined =
    credit !== undefined && debit !== undefined && credit === debit

  return {
    date,
    amount: signedCombined
      ? credit
      : find('סכום', 'amount', 'sum', 'זכות/חובה', 'זכות\\חובה'),
    credit: signedCombined ? undefined : credit,
    debit: signedCombined ? undefined : debit,
    description: find('תיאור', 'פרטים', 'description', 'details', 'memo'),
    // Banks use both אסמכתא and אסמכתה
    reference: find('אסמכתא', 'אסמכתה', 'reference', 'ref', 'מספראסמכתא'),
    counterparty: find('שם', 'מוטב', 'counterparty', 'payee', 'מבצע'),
  }
}

export function parseBankCsvText(
  text: string,
  projectId: string
): { rows: NormalizedBankTransaction[]; errors: string[] } {
  const errors: string[] = []
  const raw = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], errors: ['קובץ ריק או חסר שורת כותרת'] }
  }
  const sep = detectSeparator(lines[0])
  const headers = splitCsvLine(lines[0], sep)
  const col = mapHeaders(headers)
  if (
    col.date === undefined ||
    (col.amount === undefined && col.credit === undefined && col.debit === undefined)
  ) {
    return {
      rows: [],
      errors: ['לא זוהו עמודות תאריך/סכום. ודאו ייצוא בנק עם כותרות עברית או אנגלית.'],
    }
  }

  const rows: NormalizedBankTransaction[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li], sep)
    const booked_at = parseDate(cells[col.date!] || '')
    let amount: number | null = null
    let direction: 'credit' | 'debit' = 'credit'
    if (col.credit !== undefined || col.debit !== undefined) {
      const credit = col.credit !== undefined ? parseAmount(cells[col.credit] || '') : null
      const debit = col.debit !== undefined ? parseAmount(cells[col.debit] || '') : null
      if (credit && credit !== 0) {
        amount = Math.abs(credit)
        direction = 'credit'
      } else if (debit && debit !== 0) {
        amount = Math.abs(debit)
        direction = 'debit'
      }
    } else if (col.amount !== undefined) {
      // Signed single column (e.g. Leumi/Discount "זכות/חובה"): negative = debit.
      amount = parseAmount(cells[col.amount] || '')
      if (amount !== null) {
        direction = amount < 0 ? 'debit' : 'credit'
        amount = Math.abs(amount)
      }
    }
    if (amount === null || amount === 0) {
      errors.push(`שורה ${li + 1}: סכום לא תקין`)
      continue
    }
    const description =
      col.description !== undefined ? cells[col.description] || null : null
    const reference =
      col.reference !== undefined ? cells[col.reference] || null : null
    const counterparty =
      col.counterparty !== undefined ? cells[col.counterparty] || null : null
    const skBase = [
      booked_at || '',
      amount.toFixed(2),
      direction,
      (description || '').slice(0, 80),
      (reference || '').slice(0, 40),
    ].join('|')
    const external_sk = `csv:${createHash('sha256').update(skBase).digest('hex').slice(0, 24)}`
    rows.push({
      project_id: projectId,
      booked_at,
      amount,
      currency: 'ILS',
      direction,
      description,
      reference,
      counterparty,
      external_sk,
      source: 'csv',
    })
  }
  return { rows, errors }
}
