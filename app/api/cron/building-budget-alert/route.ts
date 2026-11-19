import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/shared/logging'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { maybeNotifyBudgetAlert } from '@/lib/building-finance/budget-alert-notify'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'

export const dynamic = 'force-dynamic'

/**
 * Optional daily sweep: budget over_pace / overspent → manager SMS/WA.
 * Guarded by BUILDING_GOVERNANCE_AUTO_NOTIFY (off in prod unless explicitly true).
 */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBuildingFinancePlatformEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'finance_platform_disabled' })
  }
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'auto_notify_disabled' })
  }

  try {
    const admin = getSupabaseAdmin()
    const yearKey = String(new Date().getFullYear())

    // Bound: recent expenses in current year period only (not full table scan).
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: recent, error } = await admin
      .from('building_expenses')
      .select('client_id, project_id, budget_period_key')
      .eq('budget_period_key', yearKey)
      .is('voided_at', null)
      .gte('expense_date', since)
      .limit(200)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const seen = new Set<string>()
    let alerted = 0
    let checked = 0

    for (const row of recent ?? []) {
      const r = row as {
        client_id: string
        project_id: string
        budget_period_key: string | null
      }
      const period = r.budget_period_key || yearKey
      const key = `${r.client_id}:${r.project_id}:${period}`
      if (seen.has(key)) continue
      seen.add(key)
      checked++

      const result = await maybeNotifyBudgetAlert(admin, {
        clientId: r.client_id,
        projectId: r.project_id,
        periodKey: period,
      })
      if (result.alerted) alerted++
    }

    logger.info('CRON', 'building-budget-alert done', { checked, alerted })
    return NextResponse.json({ ok: true, checked, alerted })
  } catch (e) {
    logger.error(
      'CRON',
      'building-budget-alert failed',
      e instanceof Error ? e : new Error(String(e))
    )
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
