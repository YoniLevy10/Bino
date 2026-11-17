import { describe, expect, it } from 'vitest'
import {
  parseExpenseSumPayload,
  validateExpenseSumQuery,
} from '@/lib/building-finance/expense-sums'

describe('parseExpenseSumPayload', () => {
  it('parses RPC row shape', () => {
    expect(parseExpenseSumPayload([{ spent: '1500.5', expense_count: '12' }])).toEqual({
      spent: 1500.5,
      expense_count: 12,
    })
  })

  it('parses aggregate sum/count aliases', () => {
    expect(parseExpenseSumPayload({ sum: 200, count: 3 })).toEqual({
      spent: 200,
      expense_count: 3,
    })
  })

  it('returns zeros for empty/null payloads', () => {
    expect(parseExpenseSumPayload(null)).toEqual({ spent: 0, expense_count: 0 })
    expect(parseExpenseSumPayload([])).toEqual({ spent: 0, expense_count: 0 })
  })

  it('clamps negative and non-finite values', () => {
    expect(parseExpenseSumPayload({ spent: -10, expense_count: Number.NaN })).toEqual({
      spent: 0,
      expense_count: 0,
    })
  })
})

describe('validateExpenseSumQuery', () => {
  it('requires dates for date_range', () => {
    expect(
      validateExpenseSumQuery({
        clientId: 'c',
        projectId: 'p',
        mode: 'date_range',
      })
    ).toMatch(/start\/end/)
  })

  it('requires period_key for period_key mode', () => {
    expect(
      validateExpenseSumQuery({
        clientId: 'c',
        projectId: 'p',
        mode: 'period_key',
      })
    ).toMatch(/period_key/)
  })

  it('accepts year_or_period with full fields', () => {
    expect(
      validateExpenseSumQuery({
        clientId: 'c',
        projectId: 'p',
        mode: 'year_or_period',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        periodKey: '2026',
      })
    ).toBeNull()
  })
})
