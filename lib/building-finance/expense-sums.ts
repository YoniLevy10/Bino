/**
 * Uncapped building-expense totals for KPIs / reports / budget alerts.
 * Never derive period spend from a capped list payload.
 *
 * Dual KPIs:
 * - recorded_spend / spent — all non-void expenses in period
 * - paid_spend — subset with payment_status=paid (cash)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roundMoney } from '@/lib/unit-ledger'

export type ExpenseSumMode = 'date_range' | 'period_key' | 'year_or_period'

export type ExpenseSumResult = {
  /** @deprecated prefer recorded_spend — alias kept for callers */
  spent: number
  recorded_spend: number
  paid_spend: number
  expense_count: number
  paid_expense_count: number
}

export type ExpenseSumQuery = {
  clientId: string
  projectId: string
  mode: ExpenseSumMode
  startDate?: string | null
  endDate?: string | null
  periodKey?: string | null
}

/** Normalize RPC / aggregate payload into recorded + paid totals. */
export function parseExpenseSumPayload(data: unknown): ExpenseSumResult {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    return {
      spent: 0,
      recorded_spend: 0,
      paid_spend: 0,
      expense_count: 0,
      paid_expense_count: 0,
    }
  }
  const r = row as {
    spent?: number | string | null
    recorded_spend?: number | string | null
    paid_spend?: number | string | null
    expense_count?: number | string | null
    paid_expense_count?: number | string | null
    sum?: number | string | null
    count?: number | string | null
  }
  const spentRaw = r.recorded_spend ?? r.spent ?? r.sum ?? 0
  const paidRaw = r.paid_spend ?? 0
  const countRaw = r.expense_count ?? r.count ?? 0
  const paidCountRaw = r.paid_expense_count ?? 0
  const spentNum = typeof spentRaw === 'number' ? spentRaw : Number(spentRaw)
  const paidNum = typeof paidRaw === 'number' ? paidRaw : Number(paidRaw)
  const countNum = typeof countRaw === 'number' ? countRaw : Number(countRaw)
  const paidCountNum = typeof paidCountRaw === 'number' ? paidCountRaw : Number(paidCountRaw)
  const recorded =
    Number.isFinite(spentNum) ? roundMoney(Math.max(0, spentNum)) : 0
  const paid = Number.isFinite(paidNum) ? roundMoney(Math.max(0, paidNum)) : 0
  return {
    spent: recorded,
    recorded_spend: recorded,
    paid_spend: paid,
    expense_count: Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : 0,
    paid_expense_count: Number.isFinite(paidCountNum)
      ? Math.max(0, Math.floor(paidCountNum))
      : 0,
  }
}

export function validateExpenseSumQuery(opts: ExpenseSumQuery): string | null {
  if (!opts.clientId || !opts.projectId) return 'client_id/project_id required'
  if (opts.mode === 'date_range') {
    if (!opts.startDate || !opts.endDate) return 'start/end dates required for date_range'
  } else if (opts.mode === 'period_key') {
    if (!opts.periodKey?.trim()) return 'period_key required'
  } else if (opts.mode === 'year_or_period') {
    if (!opts.startDate || !opts.endDate || !opts.periodKey?.trim()) {
      return 'start/end/period_key required for year_or_period'
    }
  } else {
    return 'invalid mode'
  }
  return null
}

type ExpenseSumClient = Pick<SupabaseClient, 'rpc' | 'from'>

/**
 * DB SUM/COUNT for building expenses — no row cap.
 * Prefers RPC `building_expense_period_sum`; falls back to PostgREST aggregates.
 */
export async function fetchBuildingExpenseSum(
  admin: ExpenseSumClient,
  opts: ExpenseSumQuery
): Promise<ExpenseSumResult> {
  const invalid = validateExpenseSumQuery(opts)
  if (invalid) {
    throw new Error(invalid)
  }

  try {
    const { data, error } = await admin.rpc('building_expense_period_sum', {
      p_client_id: opts.clientId,
      p_project_id: opts.projectId,
      p_mode: opts.mode,
      p_start_date: opts.startDate ?? null,
      p_end_date: opts.endDate ?? null,
      p_period_key: opts.periodKey ?? null,
    })
    if (!error && data != null) {
      return parseExpenseSumPayload(data)
    }
  } catch {
    /* fall through to PostgREST aggregate */
  }

  return fetchBuildingExpenseSumViaAggregate(admin, opts)
}

async function fetchBuildingExpenseSumViaAggregate(
  admin: ExpenseSumClient,
  opts: ExpenseSumQuery
): Promise<ExpenseSumResult> {
  const base = () =>
    admin
      .from('building_expenses')
      .select('amount.sum(), id.count()')
      .eq('client_id', opts.clientId)
      .eq('project_id', opts.projectId)
      .is('voided_at', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST filter builder chain
  const withPeriod = (q: any) => {
    if (opts.mode === 'date_range') {
      return q.gte('expense_date', opts.startDate!).lte('expense_date', opts.endDate!)
    }
    if (opts.mode === 'period_key') {
      return q.eq('budget_period_key', opts.periodKey!)
    }
    return q.or(
      `and(expense_date.gte.${opts.startDate},expense_date.lte.${opts.endDate}),budget_period_key.eq.${opts.periodKey}`
    )
  }

  const [recordedRes, paidRes] = await Promise.all([
    withPeriod(base()),
    withPeriod(base().eq('payment_status', 'paid')),
  ])
  if (recordedRes.error) {
    throw new Error(recordedRes.error.message)
  }
  if (paidRes.error) {
    throw new Error(paidRes.error.message)
  }

  const recorded = parseExpenseSumPayload(recordedRes.data)
  const paid = parseExpenseSumPayload(paidRes.data)
  return {
    spent: recorded.recorded_spend,
    recorded_spend: recorded.recorded_spend,
    paid_spend: paid.recorded_spend,
    expense_count: recorded.expense_count,
    paid_expense_count: paid.expense_count,
  }
}
