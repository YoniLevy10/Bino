import { describe, expect, it } from 'vitest'
import {
  computeBudgetUtilization,
  yearElapsedFraction,
} from '@/lib/building-finance/budget-math'

describe('computeBudgetUtilization', () => {
  it('computes utilization and remaining for cleaning example', () => {
    // PRD: budget 24_000; spent 15_000 → 62.5%
    const u = computeBudgetUtilization({
      period_key: '2026',
      planned: 24_000,
      spent: 15_000,
      elapsedFraction: 0.5,
    })
    expect(u.utilization_pct).toBe(62.5)
    expect(u.remaining).toBe(9_000)
    expect(u.over_pace).toBe(true)
  })

  it('marks on-pace when spend matches linear fraction', () => {
    const u = computeBudgetUtilization({
      period_key: '2026',
      planned: 12_000,
      spent: 6_000,
      elapsedFraction: 0.5,
    })
    expect(u.over_pace).toBe(false)
    expect(u.utilization_pct).toBe(50)
  })

  it('handles zero planned with spend', () => {
    const u = computeBudgetUtilization({
      period_key: '2026',
      planned: 0,
      spent: 100,
    })
    expect(u.utilization_pct).toBeNull()
    expect(u.remaining).toBe(-100)
  })
})

describe('yearElapsedFraction', () => {
  it('returns a value between 0 and 1', () => {
    const f = yearElapsedFraction(new Date('2026-07-01T12:00:00Z'))
    expect(f).toBeGreaterThan(0.4)
    expect(f).toBeLessThan(0.6)
  })
})
