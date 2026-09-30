import type { SupabaseClient } from '@supabase/supabase-js'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { buildDedupeKey } from '../dedupe'
import type { RecommendationDraft } from '../types'

const FOLLOWUP_HOURS = 48

const PROGRESS_ACTIONS = new Set([
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'INTERNAL_NOTE',
  'CLOSED',
  'ASSIGNED_TO_WORKER',
  'TICKET_CLOSED',
  'WORKER_UPDATE',
])

function hoursAgo(ts: string): number {
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 3_600_000
}

type LogRow = {
  ticket_id: string
  action_type: string | null
  meta: Record<string, unknown> | null
  created_at: string
  notes: string | null
}

export async function detectProfessionalFollowup(
  admin: SupabaseClient,
  clientId: string
): Promise<RecommendationDraft[]> {
  const { data: tickets, error } = await admin
    .from('tickets')
    .select('id, ticket_number, status, project_id, professional_follow_up_at, projects(name)')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .limit(200)

  if (error || !tickets?.length) return []

  const ticketIds = tickets.map((t) => t.id as string)
  const { data: logs } = await admin
    .from('ticket_logs')
    .select('ticket_id, action_type, meta, created_at, notes')
    .in('ticket_id', ticketIds)
    .order('created_at', { ascending: false })
    .limit(2000)

  const logsByTicket = new Map<string, LogRow[]>()
  for (const log of (logs || []) as LogRow[]) {
    const list = logsByTicket.get(log.ticket_id) || []
    list.push(log)
    logsByTicket.set(log.ticket_id, list)
  }

  const drafts: RecommendationDraft[] = []
  const now = Date.now()

  for (const ticket of tickets) {
    const tid = ticket.id as string
    const ticketLogs = logsByTicket.get(tid) || []
    const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
    const projectName = (project as { name?: string } | null)?.name || ''

    // Failed forward: latest FORWARDED with sms_sent === 0 (and no later successful forward)
    const forwards = ticketLogs.filter((l) => l.action_type === 'FORWARDED_TO_PROFESSIONAL')
    const latestForward = forwards[0]
    if (latestForward) {
      const smsSent = Number((latestForward.meta as { sms_sent?: number } | null)?.sms_sent ?? 0)
      const laterSuccess = forwards.some(
        (l) =>
          new Date(l.created_at).getTime() >= new Date(latestForward.created_at).getTime() &&
          Number((l.meta as { sms_sent?: number } | null)?.sms_sent ?? 0) > 0
      )
      if (smsSent === 0 && !laterSuccess) {
        const proName =
          typeof latestForward.meta?.professional_name === 'string'
            ? latestForward.meta.professional_name
            : null
        const proId =
          typeof latestForward.meta?.professional_id === 'string'
            ? latestForward.meta.professional_id
            : null
        drafts.push({
          recommendationType: 'professional_forward_failed',
          entityType: 'ticket',
          entityId: tid,
          dedupeKey: buildDedupeKey('professional_forward_failed', tid),
          urgency: 'high',
          reason: `שליחת הקריאה #${ticket.ticket_number} לבעל מקצוע${proName ? ` (${proName})` : ''} נכשלה. כדאי לתקן את ההעברה.`,
          facts: {
            ticket_number: ticket.ticket_number,
            project_name: projectName,
            professional_id: proId,
            professional_name: proName,
            sms_sent: 0,
            event_at: latestForward.created_at,
          },
          primaryAction: 'open_ticket',
          primaryActionHref: `/dashboard?ticket=${tid}&focus=forward`,
          actions: [
            {
              id: 'open_ticket',
              label: 'פתיחת הקריאה',
              href: `/dashboard?ticket=${tid}`,
              kind: 'navigate',
            },
            {
              id: 'retry_forward',
              label: 'תיקון ההעברה',
              href: `/dashboard?ticket=${tid}&focus=forward`,
              kind: 'navigate',
              requiresAddon: PAID_ADDON_KEYS.professionals,
            },
            { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
          ],
        })
        continue
      }
    }

    // Successful professional path event
    let anchor: LogRow | null = null
    for (const log of ticketLogs) {
      if (log.action_type === 'WORKER_PROFESSIONAL_ESCORT') {
        anchor = log
        break
      }
      if (log.action_type === 'FORWARDED_TO_PROFESSIONAL') {
        const smsSent = Number((log.meta as { sms_sent?: number } | null)?.sms_sent ?? 0)
        if (smsSent > 0) {
          anchor = log
          break
        }
      }
    }
    if (!anchor) continue

    const followUpAt = ticket.professional_follow_up_at as string | null
    if (followUpAt && new Date(followUpAt).getTime() > now) {
      // Future follow-up scheduled — not yet due
      continue
    }

    const anchorAgeH = hoursAgo(anchor.created_at)
    if (anchorAgeH < FOLLOWUP_HOURS && !followUpAt) continue
    // If follow-up date passed, show regardless of 48h from anchor (as long as open)

    const anchorTime = new Date(anchor.created_at).getTime()
    const hasLaterProgress = ticketLogs.some((l) => {
      if (new Date(l.created_at).getTime() <= anchorTime) return false
      if (l.action_type && PROGRESS_ACTIONS.has(l.action_type)) return true
      // Explicit note-like actions
      if (l.notes && l.action_type && l.action_type !== anchor.action_type) {
        if (l.action_type !== 'FORWARDED_TO_PROFESSIONAL') return true
      }
      return false
    })
    if (hasLaterProgress && !followUpAt) continue

    const days = Math.max(1, Math.floor(anchorAgeH / 24))
    const proName =
      typeof anchor.meta?.professional_name === 'string' ? anchor.meta.professional_name : null
    const proId =
      typeof anchor.meta?.professional_id === 'string' ? anchor.meta.professional_id : null

    const eventLabel =
      anchor.action_type === 'WORKER_PROFESSIONAL_ESCORT'
        ? 'דווח ליווי בעל מקצוע'
        : 'הועברה לבעל מקצוע'

    drafts.push({
      recommendationType: 'professional_followup',
      entityType: 'ticket',
      entityId: tid,
      dedupeKey: buildDedupeKey('professional_followup', tid),
      urgency: days >= 4 ? 'high' : 'medium',
      reason: `הקריאה #${ticket.ticket_number} ${eventLabel} לפני ${days === 1 ? 'יום' : `${days} ימים`} ועדיין פתוחה. לבדוק התקדמות?`,
      facts: {
        ticket_number: ticket.ticket_number,
        project_name: projectName,
        professional_id: proId,
        professional_name: proName,
        anchor_action: anchor.action_type,
        anchor_at: anchor.created_at,
        professional_follow_up_at: followUpAt,
        // Explicit: PROFESSIONAL_ESCORT status alone does not mean visit completed
        visit_completed: false,
      },
      primaryAction: 'open_ticket',
      primaryActionHref: `/dashboard?ticket=${tid}`,
      actions: [
        {
          id: 'open_ticket',
          label: 'פתיחת הקריאה',
          href: `/dashboard?ticket=${tid}`,
          kind: 'navigate',
        },
        ...(proId
          ? [
              {
                id: 'pro_details',
                label: 'פרטי בעל המקצוע',
                href: `/professionals?id=${proId}`,
                kind: 'navigate' as const,
                requiresAddon: PAID_ADDON_KEYS.professionals,
              },
            ]
          : []),
        {
          id: 'document_update',
          label: 'תיעוד עדכון',
          href: `/dashboard?ticket=${tid}&focus=note`,
          kind: 'navigate',
        },
        {
          id: 'set_follow_up',
          label: 'קביעת מועד מעקב',
          kind: 'set_follow_up',
        },
        { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' },
      ],
    })
  }

  return drafts
}
