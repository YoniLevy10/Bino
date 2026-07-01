import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import {
  PLAN_HEBREW_LABELS,
  PLAN_TIER_ORDER,
  planLimitsLine,
  planPriceLabel,
} from '@/lib/plan-display'
import { getPlanPricingRow } from '@/lib/plan-pricing'
import {
  PLAN_LIMITS,
  PLAN_PRICES,
  effectiveMaxBuildings,
  effectiveMaxTicketsPerMonth,
  effectiveMaxWorkers,
  getClientPlanRow,
  normalizeTier,
  type PlanTier,
} from '@/lib/plan-limits'

function startOfMonthIso() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function weekKeyMonday(d: Date) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x.toISOString().slice(0, 10)
}

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const { admin, clientId } = auth.ctx
  const monthStart = startOfMonthIso()

  try {
    const clientPlan = await getClientPlanRow(admin, clientId)
    const planRow = clientPlan.data as Parameters<typeof effectiveMaxBuildings>[0]
    const tier = normalizeTier(planRow?.plan_tier)
    const catalog = await getPlanPricingRow(admin, tier)

    const [ticketsMonth, residentsCount, workersActive, ticketsForWeeks, buildingsCount] =
      await Promise.all([
      admin
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .gte('created_at', monthStart),
      admin
        .from('residents')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null),
      admin
        .from('workers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_active', true)
        .is('deleted_at', null),
      admin
        .from('tickets')
        .select('created_at')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .gte('created_at', new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString()),
      admin
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_active', true),
    ])

    if (
      ticketsMonth.error ||
      residentsCount.error ||
      workersActive.error ||
      ticketsForWeeks.error ||
      buildingsCount.error
    ) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const weekMap = new Map<string, number>()
    const rows = (ticketsForWeeks.data || []) as { created_at: string }[]
    for (const r of rows) {
      const k = weekKeyMonday(new Date(r.created_at))
      weekMap.set(k, (weekMap.get(k) || 0) + 1)
    }
    const chart = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, count]) => ({ week_start, count }))

    const plans = PLAN_TIER_ORDER.map((planId: PlanTier) => ({
      id: planId,
      label: PLAN_HEBREW_LABELS[planId],
      price: PLAN_PRICES[planId],
      limits: PLAN_LIMITS[planId],
      limitsLine: planLimitsLine(planId),
      isCurrent: planId === tier,
    }))

    return NextResponse.json({
      ticketsThisMonth: ticketsMonth.count ?? 0,
      residentsTotal: residentsCount.count ?? 0,
      workersActive: workersActive.count ?? 0,
      buildingsActive: buildingsCount.count ?? 0,
      ticketsByWeek: chart,
      plan: {
        tier,
        label: PLAN_HEBREW_LABELS[tier],
        price: planPriceLabel(tier),
        limitsLine: planLimitsLine(tier),
        maxBuildings: effectiveMaxBuildings(planRow, catalog),
        maxWorkers: effectiveMaxWorkers(planRow, catalog),
        maxTicketsPerMonth: effectiveMaxTicketsPerMonth(planRow, catalog),
      },
      plans,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
