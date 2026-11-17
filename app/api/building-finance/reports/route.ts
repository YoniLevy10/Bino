import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { PAID_ADDON_KEYS, clientHasPaidAddon } from '@/lib/paid-addons'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import {
  buildPeriodRange,
  defaultPeriodKey,
  resolvePlannedForPeriod,
  type FinancePeriodGranularity,
} from '@/lib/building-finance/period'
import { aggregateBuildingReport } from '@/lib/building-finance/report-aggregate'
import { fetchBuildingExpenseSum } from '@/lib/building-finance/expense-sums'
import { aggregateGrowPeriodCard } from '@/lib/building-finance/grow-period-card'
import { computeBudgetUtilization } from '@/lib/building-finance/budget-math'
import { roundMoney } from '@/lib/unit-ledger'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

/** Hard cap for P&L line preview only — KPI totals use DB SUM (no row cap). */
const EXPENSE_ROW_CAP = 500
const GROW_CHARGE_CAP = 400

function platformDisabled() {
  return NextResponse.json(
    { error: 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה', code: 'FINANCE_PLATFORM_DISABLED' },
    { status: 503 }
  )
}

function parseGranularity(raw: string | null): FinancePeriodGranularity {
  if (raw === 'quarter' || raw === 'month' || raw === 'year') return raw
  return 'year'
}

/**
 * GET building accounting report for one project + period.
 * Query: project_id (required), period_key OR granularity (year|quarter|month).
 */
export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-reports'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const granularity = parseGranularity(url.searchParams.get('granularity'))
  const periodKeyParam = url.searchParams.get('period_key')?.trim()
  const periodKey = periodKeyParam || defaultPeriodKey(granularity)
  const period = buildPeriodRange(periodKey)
  if (!period) {
    return NextResponse.json({ error: 'period_key לא תקין' }, { status: 400 })
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (projectError) {
    return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const yearKey = period.period_key.slice(0, 4)
  const previous = buildPeriodRange(period.previous_period_key)

  const [
    expensesRes,
    periodSumRes,
    prevSumRes,
    exactBudgetRes,
    annualBudgetRes,
    categoriesRes,
  ] = await Promise.all([
    admin
      .from('building_expenses')
      .select(
        'id, amount, currency, expense_date, vendor_name, description, payment_status, category_id'
      )
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', projectId)
      .is('voided_at', null)
      .gte('expense_date', period.start_date)
      .lte('expense_date', period.end_date)
      .order('expense_date', { ascending: false })
      .limit(EXPENSE_ROW_CAP),
    fetchBuildingExpenseSum(admin, {
      clientId: auth.ctx.clientId,
      projectId,
      mode: 'date_range',
      startDate: period.start_date,
      endDate: period.end_date,
    }).then(
      (sum) => ({ sum, error: null as Error | null }),
      (err: unknown) => ({
        sum: null,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    ),
    previous
      ? fetchBuildingExpenseSum(admin, {
          clientId: auth.ctx.clientId,
          projectId,
          mode: 'date_range',
          startDate: previous.start_date,
          endDate: previous.end_date,
        }).then(
          (sum) => ({ sum, error: null as Error | null }),
          (err: unknown) => ({
            sum: null,
            error: err instanceof Error ? err : new Error(String(err)),
          })
        )
      : Promise.resolve({
          sum: {
            spent: 0,
            recorded_spend: 0,
            paid_spend: 0,
            expense_count: 0,
            paid_expense_count: 0,
          },
          error: null as Error | null,
        }),
    admin
      .from('building_budgets')
      .select('amount_planned, period_key')
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', projectId)
      .eq('period_key', period.period_key)
      .is('category_id', null)
      .maybeSingle(),
    admin
      .from('building_budgets')
      .select('amount_planned, period_key')
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', projectId)
      .eq('period_key', yearKey)
      .is('category_id', null)
      .maybeSingle(),
    admin
      .from('building_expense_categories')
      .select('id, name_he')
      .eq('client_id', auth.ctx.clientId)
      .limit(100),
  ])

  if (expensesRes.error) {
    getLogger().error(
      'BUILDING_FINANCE',
      'reports expenses failed',
      new Error(expensesRes.error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת דוח הוצאות' }, { status: 500 })
  }

  const categoryNames: Record<string, string> = {}
  for (const c of categoriesRes.data ?? []) {
    categoryNames[c.id] = c.name_he
  }

  const expenses = expensesRes.data ?? []
  const agg = aggregateBuildingReport({
    expenses,
    categoryNames,
    lineLimit: 100,
  })

  let totalsIncomplete = false
  let recordedSpend = agg.spent
  let paidSpend = 0
  if (periodSumRes.error || !periodSumRes.sum) {
    totalsIncomplete = true
    getLogger().warn('BUILDING_FINANCE', 'reports period sum failed; using preview spent', {
      clientId: auth.ctx.clientId,
      err: periodSumRes.error?.message,
    })
  } else {
    recordedSpend = periodSumRes.sum.recorded_spend
    paidSpend = periodSumRes.sum.paid_spend
  }

  let previousSpent = 0
  if (prevSumRes.error || !prevSumRes.sum) {
    totalsIncomplete = true
    getLogger().warn('BUILDING_FINANCE', 'reports previous period sum failed', {
      clientId: auth.ctx.clientId,
      err: prevSumRes.error?.message,
    })
  } else {
    previousSpent = prevSumRes.sum.recorded_spend
  }

  const { planned, planned_source } = resolvePlannedForPeriod({
    period,
    exactPeriodPlanned:
      exactBudgetRes.data?.amount_planned != null
        ? Number(exactBudgetRes.data.amount_planned)
        : null,
    annualPlanned:
      annualBudgetRes.data?.amount_planned != null
        ? Number(annualBudgetRes.data.amount_planned)
        : null,
  })

  /** Budget utilization uses recorded (non-void) spend — not cash-paid only. */
  const utilizationBasis = 'recorded' as const
  const utilization = computeBudgetUtilization({
    period_key: period.period_key,
    planned,
    spent: recordedSpend,
    elapsedFraction: period.elapsed_fraction,
  })

  const spendDelta = roundMoney(recordedSpend - previousSpent)
  const spendDeltaPct =
    previousSpent > 0 ? roundMoney((spendDelta / previousSpent) * 100) : null

  const linesTruncated = agg.truncated || expenses.length >= EXPENSE_ROW_CAP

  /** Optional Grow/collections read-only card — never writes; skip quietly if locked. */
  let grow: {
    available: boolean
    collected: number
    outstanding: number
    billed: number
    net_vs_expenses: number | null
    labels: {
      collected: string
      outstanding: string
      billed: string
    } | null
    collected_date_basis: string | null
  } | null = null

  try {
    const hasCollections = await clientHasPaidAddon(
      admin,
      auth.ctx.clientId,
      PAID_ADDON_KEYS.collections
    )
    if (hasCollections) {
      /**
       * Two bounded reads: created-in-period (billed/outstanding) + paid-in-period (collected).
       * Merge by row identity then aggregate with documented date semantics.
       */
      const createdWindow = admin
        .from('collection_charges')
        .select('id, status, amount, paid_at, updated_at, created_at')
        .eq('client_id', auth.ctx.clientId)
        .eq('project_id', projectId)
        .gte('created_at', `${period.start_date}T00:00:00.000Z`)
        .lte('created_at', `${period.end_date}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(GROW_CHARGE_CAP)

      const paidWindow = admin
        .from('collection_charges')
        .select('id, status, amount, paid_at, updated_at, created_at')
        .eq('client_id', auth.ctx.clientId)
        .eq('project_id', projectId)
        .eq('status', 'paid')
        .gte('paid_at', `${period.start_date}T00:00:00.000Z`)
        .lte('paid_at', `${period.end_date}T23:59:59.999Z`)
        .order('paid_at', { ascending: false })
        .limit(GROW_CHARGE_CAP)

      const [createdRes, paidRes] = await Promise.all([createdWindow, paidWindow])
      if (!createdRes.error && !paidRes.error) {
        const byId = new Map<
          string,
          {
            status: string
            amount: number
            paid_at: string | null
            updated_at: string | null
            created_at: string
          }
        >()
        for (const row of [...(createdRes.data ?? []), ...(paidRes.data ?? [])]) {
          byId.set(row.id, {
            status: row.status,
            amount: Number(row.amount) || 0,
            paid_at: row.paid_at,
            updated_at: row.updated_at,
            created_at: row.created_at,
          })
        }
        const card = aggregateGrowPeriodCard([...byId.values()], {
          startDate: period.start_date,
          endDate: period.end_date,
        })
        grow = {
          available: true,
          collected: card.collected,
          outstanding: card.outstanding,
          billed: card.billed,
          net_vs_expenses: roundMoney(card.collected - recordedSpend),
          labels: card.labels,
          collected_date_basis: card.collected_date_basis,
        }
      }
    } else {
      grow = {
        available: false,
        collected: 0,
        outstanding: 0,
        billed: 0,
        net_vs_expenses: null,
        labels: null,
        collected_date_basis: null,
      }
    }
  } catch {
    grow = {
      available: false,
      collected: 0,
      outstanding: 0,
      billed: 0,
      net_vs_expenses: null,
      labels: null,
      collected_date_basis: null,
    }
  }

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    period: {
      period_key: period.period_key,
      granularity: period.granularity,
      start_date: period.start_date,
      end_date: period.end_date,
      label_he: period.label_he,
      previous_period_key: period.previous_period_key,
    },
    kpi: {
      ...utilization,
      /** spent remains recorded for backward compat */
      spent: recordedSpend,
      recorded_spend: recordedSpend,
      paid_spend: paidSpend,
      utilization_basis: utilizationBasis,
      utilization_basis_label_he: 'ניצול תקציב לפי הוצאות רשומות (לא רק שולם)',
      planned_source,
      previous_spent: previousSpent,
      spend_delta: spendDelta,
      spend_delta_pct: spendDeltaPct,
    },
    breakdown: {
      by_category: agg.by_category,
      by_payment_status: agg.by_payment_status,
      by_vendor: agg.by_vendor,
    },
    pnl: {
      expenses_total: recordedSpend,
      recorded_spend: recordedSpend,
      paid_spend: paidSpend,
      income_grow_collected: grow?.available ? grow.collected : null,
      net: grow?.available ? grow.net_vs_expenses : null,
      lines: agg.lines,
      /** @deprecated use lines_truncated — kept for older clients */
      truncated: linesTruncated,
      lines_truncated: linesTruncated,
      totals_incomplete: totalsIncomplete,
      row_cap: EXPENSE_ROW_CAP,
      row_count: expenses.length,
      expense_count: periodSumRes.sum?.expense_count ?? expenses.length,
    },
    grow,
  })
}
