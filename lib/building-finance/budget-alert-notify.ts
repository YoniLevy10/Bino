import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeBudgetUtilization,
  yearElapsedFraction,
} from '@/lib/building-finance/budget-math'
import { isBuildingGovernanceAutoNotifyEnabled } from '@/lib/building-governance/auto-notify-gate'
import { notifyTenantManagerService } from '@/lib/building-governance/service-notify'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'
import { getPublicAppUrl } from '@/lib/public-app-url'

export type BudgetAlertKind = 'overspent' | 'over_pace'

export type BudgetAlertResult = {
  checked: boolean
  alerted: boolean
  kind?: BudgetAlertKind
  skippedReason?: string
}

async function alreadyAlertedRecently(
  admin: SupabaseClient,
  clientId: string,
  projectId: string,
  periodKey: string,
  kind: BudgetAlertKind
): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('audit_log')
    .select('id, new_values')
    .eq('client_id', clientId)
    .eq('action', 'building_budget_alert')
    .eq('entity_type', 'building_budget')
    .eq('entity_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data?.length) return false

  return data.some((row) => {
    const v = (row as { new_values?: { period_key?: string; kind?: string } | null }).new_values
    return v?.period_key === periodKey && v?.kind === kind
  })
}

/**
 * After expense create (or cron): if budget overspent / over_pace, notify manager once per kind/day.
 */
export async function maybeNotifyBudgetAlert(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    periodKey: string
    projectName?: string | null
    userId?: string | null
  }
): Promise<BudgetAlertResult> {
  if (!isBuildingGovernanceAutoNotifyEnabled()) {
    return { checked: false, alerted: false, skippedReason: 'auto_notify_disabled' }
  }

  const periodKey = opts.periodKey.trim()
  if (!periodKey) {
    return { checked: false, alerted: false, skippedReason: 'no_period' }
  }

  const [{ data: budget }, { data: expenseRows }, { data: project }] = await Promise.all([
    admin
      .from('building_budgets')
      .select('amount_planned')
      .eq('client_id', opts.clientId)
      .eq('project_id', opts.projectId)
      .eq('period_key', periodKey)
      .is('category_id', null)
      .maybeSingle(),
    admin
      .from('building_expenses')
      .select('amount')
      .eq('client_id', opts.clientId)
      .eq('project_id', opts.projectId)
      .eq('budget_period_key', periodKey)
      .is('voided_at', null)
      .limit(500),
    admin
      .from('projects')
      .select('name')
      .eq('id', opts.projectId)
      .eq('client_id', opts.clientId)
      .maybeSingle(),
  ])

  const planned = Number((budget as { amount_planned?: number } | null)?.amount_planned ?? 0)
  if (!(planned > 0)) {
    return { checked: true, alerted: false, skippedReason: 'no_budget' }
  }

  const spent = (expenseRows ?? []).reduce(
    (sum, row) => sum + Number((row as { amount?: number }).amount ?? 0),
    0
  )

  const utilization = computeBudgetUtilization({
    period_key: periodKey,
    planned,
    spent,
    elapsedFraction: /^\d{4}$/.test(periodKey) ? yearElapsedFraction() : undefined,
  })

  const overspent = spent > planned
  const kind: BudgetAlertKind | null = overspent
    ? 'overspent'
    : utilization.over_pace
      ? 'over_pace'
      : null

  if (!kind) {
    return { checked: true, alerted: false, skippedReason: 'within_budget' }
  }

  if (await alreadyAlertedRecently(admin, opts.clientId, opts.projectId, periodKey, kind)) {
    return { checked: true, alerted: false, kind, skippedReason: 'already_alerted' }
  }

  const building =
    opts.projectName?.trim() ||
    (project as { name?: string } | null)?.name?.trim() ||
    'הבניין'
  const pct =
    utilization.utilization_pct !== null ? `${Math.round(utilization.utilization_pct)}%` : '—'
  const appUrl = getPublicAppUrl()
  const link = appUrl ? `${appUrl}/projects` : ''

  const message =
    kind === 'overspent'
      ? `Bino: חריגה מתקציב ${periodKey} ב-${building}. נוצל ${pct} (${spent.toFixed(0)} מתוך ${planned.toFixed(0)} ש"ח).${link ? ` ${link}` : ''}`
      : `Bino: קצב הוצאות גבוה מהתכנון ב-${building} (${periodKey}). נוצל ${pct} מהתקציב.${link ? ` ${link}` : ''}`

  const result = await notifyTenantManagerService(admin, {
    clientId: opts.clientId,
    message,
    channel: `building_budget_${kind}`,
  })

  if (result.skipped || (!result.sms && !result.whatsapp)) {
    getLogger().info('BUILDING_FINANCE', 'budget alert notify not delivered', {
      clientId: opts.clientId,
      projectId: opts.projectId,
      kind,
      reason: result.reason,
    })
    return { checked: true, alerted: false, kind, skippedReason: result.reason || 'send_failed' }
  }

  await logAudit({
    clientId: opts.clientId,
    userId: opts.userId ?? null,
    action: 'building_budget_alert',
    entityType: 'building_budget',
    entityId: opts.projectId,
    newValues: {
      period_key: periodKey,
      kind,
      spent,
      planned,
      sms: result.sms,
      whatsapp: result.whatsapp,
    },
  })

  return { checked: true, alerted: true, kind }
}
