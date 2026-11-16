import { describe, expect, it } from 'vitest'
import {
  buildPeriodRange,
  defaultPeriodKey,
  parsePeriodKey,
  periodElapsedFraction,
  resolvePlannedForPeriod,
} from '@/lib/building-finance/period'
import { aggregateBuildingReport } from '@/lib/building-finance/report-aggregate'

describe('parsePeriodKey / buildPeriodRange', () => {
  it('parses year, quarter, month', () => {
    expect(parsePeriodKey('2026')?.granularity).toBe('year')
    expect(parsePeriodKey('2026-Q2')).toEqual({
      year: 2026,
      granularity: 'quarter',
      quarter: 2,
    })
    expect(parsePeriodKey('2026-03')?.month).toBe(3)
  })

  it('builds quarter range and previous key', () => {
    const r = buildPeriodRange('2026-Q1')
    expect(r?.start_date).toBe('2026-01-01')
    expect(r?.end_date).toBe('2026-03-31')
    expect(r?.previous_period_key).toBe('2025-Q4')
  })

  it('builds month range', () => {
    const r = buildPeriodRange('2026-02')
    expect(r?.start_date).toBe('2026-02-01')
    expect(r?.end_date).toBe('2026-02-28')
    expect(r?.previous_period_key).toBe('2026-01')
  })
})

describe('defaultPeriodKey', () => {
  it('uses current calendar parts', () => {
    const now = new Date('2026-11-16T10:00:00Z')
    expect(defaultPeriodKey('year', now)).toBe('2026')
    expect(defaultPeriodKey('quarter', now)).toBe('2026-Q4')
    expect(defaultPeriodKey('month', now)).toBe('2026-11')
  })
})

describe('periodElapsedFraction', () => {
  it('is mid-year around July', () => {
    const f = periodElapsedFraction(
      '2026-01-01',
      '2026-12-31',
      new Date('2026-07-01T12:00:00Z')
    )
    expect(f).toBeGreaterThan(0.45)
    expect(f).toBeLessThan(0.55)
  })
})

describe('resolvePlannedForPeriod', () => {
  it('prorates annual for quarter', () => {
    const period = buildPeriodRange('2026-Q2')!
    const r = resolvePlannedForPeriod({
      period,
      exactPeriodPlanned: null,
      annualPlanned: 120_000,
    })
    expect(r.planned).toBe(30_000)
    expect(r.planned_source).toBe('annual_prorata')
  })

  it('prefers exact period budget', () => {
    const period = buildPeriodRange('2026-Q2')!
    const r = resolvePlannedForPeriod({
      period,
      exactPeriodPlanned: 40_000,
      annualPlanned: 120_000,
    })
    expect(r.planned).toBe(40_000)
    expect(r.planned_source).toBe('exact')
  })
})

describe('aggregateBuildingReport', () => {
  it('rolls up category, vendor, payment', () => {
    const agg = aggregateBuildingReport({
      expenses: [
        {
          amount: 1000,
          category_id: 'c1',
          vendor_name: 'ניקיון פלוס',
          payment_status: 'paid',
          expense_date: '2026-03-01',
          description: 'חודשי',
        },
        {
          amount: 500,
          category_id: null,
          vendor_name: null,
          payment_status: 'unpaid',
          expense_date: '2026-03-10',
          description: null,
        },
      ],
      categoryNames: { c1: 'ניקיון' },
    })
    expect(agg.spent).toBe(1500)
    expect(agg.by_category[0].label).toBe('ניקיון')
    expect(agg.by_vendor.find((v) => v.label === 'ניקיון פלוס')?.amount).toBe(1000)
    expect(agg.by_payment_status.find((p) => p.key === 'paid')?.amount).toBe(1000)
  })
})
