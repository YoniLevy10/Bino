import { describe, expect, it } from 'vitest'
import { buildLaunchIdempotencyKey } from '@/lib/mbrain/campaign-builder'
import { assertGuardrailsAllow } from '@/lib/mbrain/guardrails'

describe('campaign launch safety', () => {
  it('produces stable idempotency keys for duplicate launch requests', () => {
    const a = buildLaunchIdempotencyKey({
      organizationId: 'org',
      strategyId: 'strat',
      dailyBudget: 100,
      creativeIds: ['c2', 'c1'],
    })
    const b = buildLaunchIdempotencyKey({
      organizationId: 'org',
      strategyId: 'strat',
      dailyBudget: 100,
      creativeIds: ['c1', 'c2'],
    })
    expect(a).toBe(b)
  })

  it('different budgets produce different keys', () => {
    const a = buildLaunchIdempotencyKey({
      organizationId: 'org',
      strategyId: 'strat',
      dailyBudget: 100,
      creativeIds: ['c1'],
    })
    const b = buildLaunchIdempotencyKey({
      organizationId: 'org',
      strategyId: 'strat',
      dailyBudget: 150,
      creativeIds: ['c1'],
    })
    expect(a).not.toBe(b)
  })

  it('AI cannot bypass launch guardrails', () => {
    expect(() =>
      assertGuardrailsAllow({
        guardrails: {
          monthly_spend_limit: 1000,
          daily_spend_limit: 50,
          max_campaign_daily_budget: 40,
          max_budget_increase_percentage: 10,
          max_cpl: 150,
          auto_pause_enabled: false,
          currency: 'ILS',
        },
        proposedDailyBudget: 100,
      })
    ).toThrow()
  })
})
