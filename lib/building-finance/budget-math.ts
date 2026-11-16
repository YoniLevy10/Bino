import { roundMoney } from '@/lib/unit-ledger'
import type { BudgetUtilization } from '@/lib/building-finance/types'

/**
 * Budget vs spend for a period.
 * `elapsedFraction` is 0–1 progress through the period (linear pace).
 * Example: half year elapsed → 0.5; spent above planned*0.5 → over_pace.
 */
export function computeBudgetUtilization(opts: {
  period_key: string
  planned: number
  spent: number
  elapsedFraction?: number
}): BudgetUtilization {
  const planned = roundMoney(Math.max(0, opts.planned))
  const spent = roundMoney(Math.max(0, opts.spent))
  const remaining = roundMoney(planned - spent)
  const utilization_pct =
    planned > 0 ? roundMoney((spent / planned) * 100) : spent > 0 ? null : 0

  const fraction =
    typeof opts.elapsedFraction === 'number' && Number.isFinite(opts.elapsedFraction)
      ? Math.min(1, Math.max(0, opts.elapsedFraction))
      : null

  const over_pace =
    fraction !== null && planned > 0 ? spent > roundMoney(planned * fraction) : false

  return {
    period_key: opts.period_key,
    planned,
    spent,
    remaining,
    utilization_pct,
    over_pace,
  }
}

/** Calendar-year fraction elapsed in Asia/Jerusalem (approx by month/day). */
export function yearElapsedFraction(now = new Date()): number {
  const y = now.getFullYear()
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y + 1, 0, 1)
  const t = now.getTime()
  return Math.min(1, Math.max(0, (t - start) / (end - start)))
}
