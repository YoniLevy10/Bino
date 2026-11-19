import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { parseBankCsvText, splitCsvLine } from '@/lib/bank-match/csv-parse'

const fixtureDir = dirname(fileURLToPath(import.meta.url))

describe('parseBankCsvText', () => {
  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd'])
  })

  it('parses leumi-style fixture', () => {
    const text = readFileSync(
      join(fixtureDir, 'fixtures/leumi-sample.csv'),
      'utf8'
    )
    const { rows, errors } = parseBankCsvText(text, 'proj-1')
    expect(errors.length).toBe(0)
    expect(rows.length).toBe(4)
    expect(rows[0].direction).toBe('credit')
    expect(rows[0].amount).toBe(400)
    expect(rows[0].booked_at).toBe('2026-11-01')
    expect(rows[0].description).toContain('BINO-A1B2')
    expect(rows[0].source).toBe('csv')
    expect(rows[0].external_sk.startsWith('csv:')).toBe(true)

    const debit = rows.find((r) => r.direction === 'debit')
    expect(debit?.amount).toBe(50)

    // Dedupe key stable for same content
    const again = parseBankCsvText(text, 'proj-1')
    expect(again.rows[0].external_sk).toBe(rows[0].external_sk)
  })

  it('parses BINO demo vaad statement (signed זכות/חובה + אסמכתה)', () => {
    const text = readFileSync(
      join(fixtureDir, 'fixtures/BINO_demo_vaad_bank_statement.csv'),
      'utf8'
    )
    const { rows, errors } = parseBankCsvText(text, 'proj-demo')
    expect(errors.length).toBe(0)
    expect(rows.length).toBe(41)

    const cleaning = rows.find((r) => r.description?.includes('ניקיון'))
    expect(cleaning?.direction).toBe('debit')
    expect(cleaning?.amount).toBe(840)
    expect(cleaning?.booked_at).toBe('2026-11-16')
    expect(cleaning?.reference).toBe('SIM-00041')

    const resident = rows.find((r) =>
      r.description?.includes('נועה כהן - ועד בית דירה 01 נובמבר')
    )
    expect(resident?.direction).toBe('credit')
    expect(resident?.amount).toBe(450)
    expect(resident?.reference).toBe('SIM-00020')

    const credits = rows.filter((r) => r.direction === 'credit')
    const debits = rows.filter((r) => r.direction === 'debit')
    expect(credits.length).toBeGreaterThan(0)
    expect(debits.length).toBeGreaterThan(0)
    expect(credits.length + debits.length).toBe(41)
  })
})

