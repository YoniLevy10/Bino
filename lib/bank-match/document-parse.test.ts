import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  parseBankDocument,
  parseBankStatementTextLines,
} from '@/lib/bank-match/document-parse'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

describe('parseBankStatementTextLines', () => {
  it('extracts dated amount lines from PDF-like text', () => {
    const text = `
דף חשבון
01/11/2026 העברה מדירה 12 BINO-A1B2 400.00
02/11/2026 עמלה -12.50
ללא תאריך כלום
`
    const { rows, errors } = parseBankStatementTextLines(text, 'proj')
    expect(errors.length).toBe(0)
    expect(rows.length).toBe(2)
    expect(rows[0].amount).toBe(400)
    expect(rows[0].direction).toBe('credit')
    expect(rows[1].direction).toBe('debit')
    expect(rows[1].amount).toBe(12.5)
  })

  it('parses tab-separated bank PDF rows', () => {
    const text = [
      'תאריך\tיום ערך\tתיאור התנועה\tחובה ₪ / זכות\tיתרה ₪\tאסמכתה',
      '16/11/2026\t16/11/2026\tחיוב קבוע - ניקיון בניין\t-840.00\t15,224.50\tSIM-00041\t—\tהוראת קבע',
      '13/11/2026\t13/11/2026\tהעברה מלקוח\t300.00\t16,544.50\tSIM-00039\t—\tאינטרנט',
    ].join('\n')
    const { rows, errors } = parseBankStatementTextLines(text, 'proj')
    expect(errors.length).toBe(0)
    expect(rows.length).toBe(2)
    expect(rows[0].direction).toBe('debit')
    expect(rows[0].amount).toBe(840)
    expect(rows[0].reference).toBe('SIM-00041')
    expect(rows[0].description).toContain('ניקיון')
    expect(rows[1].direction).toBe('credit')
    expect(rows[1].amount).toBe(300)
  })
})

describe('parseBankDocument demo fixtures', () => {
  it('parses BINO demo xlsx via OOXML fallback', async () => {
    const bytes = readFileSync(join(fixtureDir, 'BINO_demo_vaad_bank_statement.xlsx'))
    const doc = await parseBankDocument({
      projectId: 'proj',
      fileName: 'BINO_demo_vaad_bank_statement.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
    })
    expect(doc.format).toBe('excel')
    expect(doc.errors).toEqual([])
    expect(doc.rows.length).toBe(41)
    const cleaning = doc.rows.find((r) => r.description?.includes('ניקיון'))
    expect(cleaning?.direction).toBe('debit')
    expect(cleaning?.amount).toBe(840)
    expect(cleaning?.booked_at).toBe('2026-11-16')
    expect(cleaning?.reference).toBe('SIM-00041')
    expect(doc.rows.filter((r) => r.direction === 'debit').length).toBeGreaterThan(0)
    expect(doc.rows.filter((r) => r.direction === 'credit').length).toBeGreaterThan(0)
  })

  it('parses BINO demo pdf tab rows', async () => {
    const bytes = readFileSync(join(fixtureDir, 'BINO_demo_vaad_bank_statement.pdf'))
    const doc = await parseBankDocument({
      projectId: 'proj',
      fileName: 'BINO_demo_vaad_bank_statement.pdf',
      mimeType: 'application/pdf',
      bytes,
    })
    expect(doc.format).toBe('pdf')
    expect(doc.rows.length).toBe(41)
    const cleaning = doc.rows.find((r) => r.description?.includes('ניקיון'))
    expect(cleaning?.direction).toBe('debit')
    expect(cleaning?.amount).toBe(840)
    expect(cleaning?.reference).toBe('SIM-00041')
  })
})
