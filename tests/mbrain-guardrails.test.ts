import { describe, expect, it } from 'vitest'
import {
  assertGuardrailsAllow,
  evaluateBudgetAgainstGuardrails,
  type Guardrails,
} from '@/lib/mbrain/guardrails'

const base: Guardrails = {
  monthly_spend_limit: 3000,
  daily_spend_limit: 150,
  max_campaign_daily_budget: 100,
  max_budget_increase_percentage: 20,
  max_cpl: 150,
  auto_pause_enabled: false,
  currency: 'ILS',
}

describe('mbrain guardrails', () => {
  it('rejects daily budget above max_campaign_daily_budget', () => {
    const v = evaluateBudgetAgainstGuardrails({
      guardrails: base,
      proposedDailyBudget: 120,
    })
    expect(v.some((x) => x.code === 'MAX_CAMPAIGN_DAILY_BUDGET')).toBe(true)
  })

  it('rejects increases beyond max_budget_increase_percentage', () => {
    const v = evaluateBudgetAgainstGuardrails({
      guardrails: base,
      currentDailyBudget: 100,
      proposedDailyBudget: 130,
    })
    expect(v.some((x) => x.code === 'MAX_BUDGET_INCREASE')).toBe(true)
  })

  it('allows compliant budgets', () => {
    expect(() =>
      assertGuardrailsAllow({
        guardrails: base,
        proposedDailyBudget: 100,
        projectedMonthlySpend: 2800,
      })
    ).not.toThrow()
  })

  it('blocks AI-proposed spend that exceeds monthly limit', () => {
    expect(() =>
      assertGuardrailsAllow({
        guardrails: base,
        proposedDailyBudget: 100,
        projectedMonthlySpend: 5000,
      })
    ).toThrow(/GUARDRAIL|monthly|Monthly/i)
  })
})
