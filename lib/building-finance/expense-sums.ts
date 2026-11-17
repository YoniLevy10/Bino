/**
 * Uncapped building-expense totals for KPIs / reports / budget alerts.
 * Never derive period spend from a capped list payload.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roundMoney } from '@/lib/unit-ledger'

export type ExpenseSumMode = 'date_range' | 'period_key' | 'year_or_period'

export type ExpenseSumResult = {
  spent: number
  expense_count: number
}

export type ExpenseSumQuery = {
  clientId: string
  projectId: string
  mode: ExpenseSumMode
  startDate?: string | null
  endDate?: string | null
  periodKey?: string | null
}

/** Normalize RPC / aggregate payload into spent + count. */
export function parseExpenseSumPayload(data: unknown): ExpenseSumResult {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    return { spent: 0, expense_count: 0 }
  }
  const r = row as {
    spent?: number | string | null
    expense_count?: number | string | null
    sum?: number | string | null
    count?: number | string | null
  }
  const spentRaw = r.spent ?? r.sum ?? 0
  const countRaw = r.expense_count ?? r.count ?? 0
  const spentNum = typeof spentRaw === 'number' ? spentRaw : Number(spentRaw)
  const countNum = typeof countRaw === 'number' ? countRaw : Number(countRaw)
  return {
    spent: Number.isFinite(spentNum) ? roundMoney(Math.max(0, spentNum)) : 0,
    expense_count: Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : 0,
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
  let query = admin
    .from('building_expenses')
    .select('amount.sum(), id.count()')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .is('voided_at', null)

  if (opts.mode === 'date_range') {
    query = query.gte('expense_date', opts.startDate!).lte('expense_date', opts.endDate!)
  } else if (opts.mode === 'period_key') {
    query = query.eq('budget_period_key', opts.periodKey!)
  } else {
    // year_or_period: date in range OR budget_period_key match (hub year KPI).
    query = query.or(
      `and(expense_date.gte.${opts.startDate},expense_date.lte.${opts.endDate}),budget_period_key.eq.${opts.periodKey}`
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }
  return parseExpenseSumPayload(data)
}
