/**
 * Spending guardrails — deterministic enforcement (never LLM-authoritative).
 */
import { z } from 'zod'

export const guardrailsSchema = z.object({
  monthly_spend_limit: z.number().nonnegative().nullable(),
  daily_spend_limit: z.number().nonnegative().nullable(),
  max_campaign_daily_budget: z.number().nonnegative().nullable(),
  max_budget_increase_percentage: z.number().nonnegative().nullable(),
  max_cpl: z.number().nonnegative().nullable(),
  auto_pause_enabled: z.boolean(),
  currency: z.string().default('ILS'),
})

export type Guardrails = z.infer<typeof guardrailsSchema>

export type GuardrailViolation = {
  code: string
  message: string
  messageHe: string
}

export function evaluateBudgetAgainstGuardrails(opts: {
  guardrails: Guardrails
  proposedDailyBudget?: number | null
  proposedLifetimeBudget?: number | null
  currentDailyBudget?: number | null
  projectedMonthlySpend?: number | null
}): GuardrailViolation[] {
  const g = opts.guardrails
  const violations: GuardrailViolation[] = []

  if (
    opts.proposedDailyBudget != null &&
    g.max_campaign_daily_budget != null &&
    opts.proposedDailyBudget > g.max_campaign_daily_budget
  ) {
    violations.push({
      code: 'MAX_CAMPAIGN_DAILY_BUDGET',
      message: `Daily budget ${opts.proposedDailyBudget} exceeds max ${g.max_campaign_daily_budget}`,
      messageHe: `תקציב יומי ${opts.proposedDailyBudget} חורג מהמקסימום ${g.max_campaign_daily_budget}`,
    })
  }

  if (
    opts.proposedDailyBudget != null &&
    g.daily_spend_limit != null &&
    opts.proposedDailyBudget > g.daily_spend_limit
  ) {
    violations.push({
      code: 'DAILY_SPEND_LIMIT',
      message: `Daily budget exceeds account daily spend limit ${g.daily_spend_limit}`,
      messageHe: `חריגה ממגבלת הוצאה יומית ${g.daily_spend_limit}`,
    })
  }

  if (
    opts.projectedMonthlySpend != null &&
    g.monthly_spend_limit != null &&
    opts.projectedMonthlySpend > g.monthly_spend_limit
  ) {
    violations.push({
      code: 'MONTHLY_SPEND_LIMIT',
      message: `Projected monthly spend exceeds ${g.monthly_spend_limit}`,
      messageHe: `חריגה ממגבלת הוצאה חודשית ${g.monthly_spend_limit}`,
    })
  }

  if (
    opts.proposedDailyBudget != null &&
    opts.currentDailyBudget != null &&
    opts.currentDailyBudget > 0 &&
    g.max_budget_increase_percentage != null
  ) {
    const increasePct =
      ((opts.proposedDailyBudget - opts.currentDailyBudget) / opts.currentDailyBudget) * 100
    if (increasePct > g.max_budget_increase_percentage) {
      violations.push({
        code: 'MAX_BUDGET_INCREASE',
        message: `Budget increase ${increasePct.toFixed(1)}% exceeds max ${g.max_budget_increase_percentage}%`,
        messageHe: `העלאת תקציב של ${increasePct.toFixed(1)}% חורגת מהמקסימום ${g.max_budget_increase_percentage}%`,
      })
    }
  }

  if (
    opts.proposedLifetimeBudget != null &&
    g.monthly_spend_limit != null &&
    opts.proposedLifetimeBudget > g.monthly_spend_limit
  ) {
    violations.push({
      code: 'LIFETIME_EXCEEDS_MONTHLY',
      message: `Lifetime budget exceeds monthly spend limit`,
      messageHe: `תקציב כולל חורג ממגבלת החודש`,
    })
  }

  return violations
}

/** Reject any spend mutation that violates guardrails. */
export function assertGuardrailsAllow(opts: Parameters<typeof evaluateBudgetAgainstGuardrails>[0]): void {
  const violations = evaluateBudgetAgainstGuardrails(opts)
  if (violations.length > 0) {
    const err = new Error(violations.map((v) => v.message).join('; '))
    ;(err as Error & { code: string; violations: GuardrailViolation[] }).code = 'GUARDRAIL_VIOLATION'
    ;(err as Error & { violations: GuardrailViolation[] }).violations = violations
    throw err
  }
}
