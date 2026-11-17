/**
 * Integration-style coverage for PR-B period semantics:
 * Grow collected-by-paid_at + dual recorded/paid expense KPIs wiring.
 * Pure helpers + response shape contracts (no live DB / Grow writes).
 */
import { describe, expect, it } from 'vitest'
import { aggregateGrowPeriodCard } from '@/lib/building-finance/grow-period-card'
import { parseExpenseSumPayload } from '@/lib/building-finance/expense-sums'
import { computeBudgetUtilization } from '@/lib/building-finance/budget-math'
import { roundMoney } from '@/lib/unit-ledger'

describe('PR-B reports period + paid KPI contract', () => {
  it('nets Grow collected (paid_at) against recorded spend, not only cash-paid expenses', () => {
    const period = { startDate: '2026-01-01', endDate: '2026-12-31' }
    const grow = aggregateGrowPeriodCard(
      [
        {
          status: 'paid',
          amount: 1000,
          paid_at: '2026-03-01T00:00:00.000Z',
          created_at: '2025-12-15T00:00:00.000Z',
        },
        {
          status: 'sent',
          amount: 400,
          paid_at: null,
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      period
    )

    const expenseSum = parseExpenseSumPayload({
      spent: 700,
      paid_spend: 200,
      expense_count: 5,
      paid_expense_count: 1,
    })

    const utilization = computeBudgetUtilization({
      period_key: '2026',
      planned: 1000,
      spent: expenseSum.recorded_spend,
      elapsedFraction: 0.5,
    })

    expect(grow.collected).toBe(1000)
    expect(grow.billed).toBe(400)
    expect(grow.outstanding).toBe(400)
    expect(grow.labels.collected).toContain('תאריך תשלום')
    expect(grow.labels.billed).toContain('תאריך יצירה')

    expect(expenseSum.recorded_spend).toBe(700)
    expect(expenseSum.paid_spend).toBe(200)
    expect(utilization.spent).toBe(700)
    expect(roundMoney(grow.collected - expenseSum.recorded_spend)).toBe(300)

    const apiKpiShape = {
      ...utilization,
      spent: expenseSum.recorded_spend,
      recorded_spend: expenseSum.recorded_spend,
      paid_spend: expenseSum.paid_spend,
      utilization_basis: 'recorded' as const,
      utilization_basis_label_he: 'ניצול תקציב לפי הוצאות רשומות (לא רק שולם)',
    }
    expect(apiKpiShape.utilization_basis).toBe('recorded')
    expect(apiKpiShape.spent).toBe(expenseSum.recorded_spend)
    expect(apiKpiShape.paid_spend).toBeLessThan(apiKpiShape.recorded_spend)
  })
})
