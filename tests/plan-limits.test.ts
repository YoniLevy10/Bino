import { describe, expect, it } from 'vitest'
import { effectiveMaxWorkers } from '@/lib/plan-limits'

describe('effectiveMaxWorkers', () => {
  it('prefers per-client override over catalog and plan defaults', () => {
    expect(
      effectiveMaxWorkers({ id: 'x', plan_tier: 'pro', max_workers: 25 }, { workers_max: 20 })
    ).toBe(25)
  })

  it('uses plan_pricing_catalog when client override is null', () => {
    expect(
      effectiveMaxWorkers({ id: 'x', plan_tier: 'pro', max_workers: null }, { workers_max: 40 })
    ).toBe(40)
  })

  it('falls back to PLAN_LIMITS when catalog has no workers cap', () => {
    expect(
      effectiveMaxWorkers({ id: 'x', plan_tier: 'pro', max_workers: null }, { workers_max: null })
    ).toBe(20)
  })

  it('returns null for enterprise unlimited', () => {
    expect(
      effectiveMaxWorkers({ id: 'x', plan_tier: 'enterprise', max_workers: null }, { workers_max: null })
    ).toBeNull()
  })
})
