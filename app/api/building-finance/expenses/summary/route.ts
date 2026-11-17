import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId } from '@/lib/api-auth'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { buildPeriodRange, defaultPeriodKey } from '@/lib/building-finance/period'
import {
  fetchBuildingExpenseSum,
  type ExpenseSumMode,
} from '@/lib/building-finance/expense-sums'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

function platformDisabled() {
  return NextResponse.json(
    { error: 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה', code: 'FINANCE_PLATFORM_DISABLED' },
    { status: 503 }
  )
}

/**
 * GET uncapped expense totals for a project + period.
 * Query: project_id (required), period_key (default current year),
 * mode=year_or_period|date_range|period_key (default year_or_period for hub KPI).
 */
export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-expense-summary'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const periodKey = url.searchParams.get('period_key')?.trim() || defaultPeriodKey('year')
  const period = buildPeriodRange(periodKey)
  if (!period) {
    return NextResponse.json({ error: 'period_key לא תקין' }, { status: 400 })
  }

  const modeRaw = url.searchParams.get('mode')?.trim() || 'year_or_period'
  const mode: ExpenseSumMode =
    modeRaw === 'date_range' || modeRaw === 'period_key' || modeRaw === 'year_or_period'
      ? modeRaw
      : 'year_or_period'

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (projectError) {
    return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  try {
    const sum = await fetchBuildingExpenseSum(admin, {
      clientId: auth.ctx.clientId,
      projectId,
      mode,
      startDate: period.start_date,
      endDate: period.end_date,
      periodKey: period.period_key,
    })

    return NextResponse.json({
      project_id: projectId,
      period_key: period.period_key,
      mode,
      start_date: period.start_date,
      end_date: period.end_date,
      spent: sum.spent,
      expense_count: sum.expense_count,
      totals_incomplete: false,
    })
  } catch (e) {
    getLogger().error(
      'BUILDING_FINANCE',
      'expense summary failed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בסיכום הוצאות' }, { status: 500 })
  }
}
