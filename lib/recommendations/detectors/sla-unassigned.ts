import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDedupeKey } from '../dedupe'
import type { RecommendationDraft } from '../types'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

function hoursAgo(ts: string): number {
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 3_600_000
}

function hasProgressiveAlternative(opts: {
  forwardSmsOk: boolean
  escortLogged: boolean
}): boolean {
  // PROFESSIONAL_ESCORT alone is NOT enough without a successful forward/escort log
  return opts.forwardSmsOk || opts.escortLogged
}

export async function detectSlaUnassigned(
  admin: SupabaseClient,
  clientId: string
): Promise<RecommendationDraft[]> {
  const minCreatedAt = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const { data: tickets, error } = await admin
    .from('tickets')
    .select(
      'id, ticket_number, created_at, project_id, assigned_worker_id, status, ticket_metadata, description'
    )
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .is('assigned_worker_id', null)
    .gte('created_at', minCreatedAt)
    .limit(200)

  if (error || !tickets?.length) return []

  const projectIds = [...new Set(tickets.map((t) => t.project_id as string).filter(Boolean))]
  const { data: projects } = await admin
    .from('projects')
    .select('id, name, sla_hours')
    .eq('client_id', clientId)
    .in('id', projectIds)

  const projectMap = new Map(
    (projects || []).map((p) => [
      p.id as string,
      { name: (p.name as string) || '', slaHours: typeof p.sla_hours === 'number' ? p.sla_hours : 24 },
    ])
  )

  const ticketIds = tickets.map((t) => t.id as string)
  const { data: logs } = await admin
    .from('ticket_logs')
    .select('ticket_id, action_type, meta, created_at')
    .in('ticket_id', ticketIds)
    .in('action_type', ['FORWARDED_TO_PROFESSIONAL', 'WORKER_PROFESSIONAL_ESCORT'])

  const forwardOk = new Set<string>()
  const escortLogged = new Set<string>()
  for (const log of logs || []) {
    const tid = log.ticket_id as string
    if (log.action_type === 'WORKER_PROFESSIONAL_ESCORT') {
      escortLogged.add(tid)
      continue
    }
    if (log.action_type === 'FORWARDED_TO_PROFESSIONAL') {
      const meta = (log.meta || {}) as { sms_sent?: number }
      if ((meta.sms_sent ?? 0) > 0) forwardOk.add(tid)
    }
  }

  const drafts: RecommendationDraft[] = []

  for (const row of tickets) {
    const pid = row.project_id as string
    const project = projectMap.get(pid)
    if (!project) continue

    const openHours = hoursAgo(row.created_at as string)
    if (openHours < project.slaHours) continue

    const tid = row.id as string
    if (
      hasProgressiveAlternative({
        forwardSmsOk: forwardOk.has(tid),
        escortLogged: escortLogged.has(tid),
      })
    ) {
      continue
    }

    const ticketNum = String(row.ticket_number)
    const hoursFloor = Math.floor(openHours)
    const reason = `קריאה #${ticketNum} בבניין ${project.name} פתוחה ${hoursFloor} שעות, מעבר לזמן שהוגדר (${project.slaHours} שעות), ועדיין ללא עובד משויך.`

    drafts.push({
      recommendationType: 'sla_unassigned',
      entityType: 'ticket',
      entityId: tid,
      dedupeKey: buildDedupeKey('sla_unassigned', tid),
      urgency: openHours >= project.slaHours * 2 ? 'critical' : 'high',
      reason,
      facts: {
        ticket_number: row.ticket_number,
        project_id: pid,
        project_name: project.name,
        open_hours: hoursFloor,
        sla_hours: project.slaHours,
        assigned_worker_id: null,
      },
      primaryAction: 'assign_worker',
      primaryActionHref: `/dashboard?ticket=${tid}&focus=assign`,
      actions: [
        {
          id: 'assign_worker',
          label: 'שיבוץ עובד',
          href: `/dashboard?ticket=${tid}&focus=assign`,
          kind: 'navigate',
        },
        {
          id: 'find_professional',
          label: 'איתור איש מקצוע',
          href: `/dashboard?ticket=${tid}&focus=midrag`,
          kind: 'midrag',
          requiresAddon: PAID_ADDON_KEYS.professionals,
        },
        { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
      ],
    })
  }

  return drafts
}
