import { describe, it, expect } from 'vitest'
import { effectiveMaxTicketsPerMonth } from '@/lib/plan-limits'

describe('plan quota helpers', () => {
  it('effectiveMaxTicketsPerMonth respects plan tier', () => {
    expect(effectiveMaxTicketsPerMonth({ id: 'x', plan_tier: 'starter' })).toBe(300)
    expect(effectiveMaxTicketsPerMonth({ id: 'x', plan_tier: 'enterprise' })).toBeNull()
  })

  it('DB override wins', () => {
    expect(
      effectiveMaxTicketsPerMonth({
        id: 'x',
        plan_tier: 'starter',
        max_tickets_per_month: 999,
      })
    ).toBe(999)
  })
})
