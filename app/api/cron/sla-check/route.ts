import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendManagerSMS } from '@/lib/sms-send'
import { getLogger } from '@/lib/logging'
import { isOutboundMessagingBlocked } from '@/lib/shabbat-messaging-gate'
import { readFixlyMetadata } from '@/lib/fixly-ticket-metadata'

/** Cap first-time SLA alerts per cron run to avoid backlog bursts. */
const MAX_FIRST_ALERTS_PER_RUN = 10
/** Ignore very old open tickets that pre-date SLA tracking. */
const SLA_TICKET_MAX_AGE_DAYS = 90

const FIXLY_ACTIVE = new Set(['claimed', 'assigned', 'en_route', 'arrived', 'in_progress', 'launched'])

function hoursAgo(ts: string): number {
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 3_600_000
}

type ClientCreds = {
  manager_phone: string | null
  sms_sender_name: string | null
}

async function getClientCreds(admin: ReturnType<typeof getSupabaseAdmin>, clientId: string): Promise<ClientCreds | null> {
  const { data } = await admin
    .from('clients')
    .select('manager_phone, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()
  return data as ClientCreds | null
}

async function sendManagerSlaSms(
  phone: string,
  message: string,
  smsSenderName: string | null,
  label: string,
  logger: ReturnType<typeof getLogger>,
  ticketId: string,
  clientId: string
): Promise<boolean> {
  try {
    return await sendManagerSMS(phone, message, smsSenderName, clientId)
  } catch (e) {
    logger.warn('CRON', `${label} SMS failed`, { ticketId, err: e instanceof Error ? e.message : String(e) })
    return false
  }
}

/**
 * Progressive alternative path (professional / Fixly) — evidence-based.
 * PROFESSIONAL_ESCORT status alone is not enough.
 */
function hasProgressiveAlternative(opts: {
  forwardSmsOk: boolean
  escortLogged: boolean
  ticketMetadata: unknown
}): boolean {
  if (opts.forwardSmsOk || opts.escortLogged) return true
  const fixly = readFixlyMetadata(opts.ticketMetadata)
  if (fixly && FIXLY_ACTIVE.has(String(fixly.last_status))) return true
  return false
}

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isOutboundMessagingBlocked()) {
    logger.info('CRON', 'sla-check skipped — Shabbat')
    return NextResponse.json({ ok: true, skipped: 'shabbat', firstAlerts: 0, managerReminders: 0, smsSent: 0, smsFailed: 0 })
  }

  try {
    const admin = getSupabaseAdmin()
    const minCreatedAt = new Date(Date.now() - SLA_TICKET_MAX_AGE_DAYS * 86_400_000).toISOString()

    const { data: tickets, error } = await admin
      .from('tickets')
      .select(
        'id, ticket_number, created_at, project_id, client_id, sla_alerted, sla_alerted_at, escalated_at, description, assigned_worker_id, status, ticket_metadata'
      )
      .is('deleted_at', null)
      .neq('status', 'CLOSED')
      .gte('created_at', minCreatedAt)

    if (error) {
      logger.error('CRON', 'sla-check tickets query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ticketIds = (tickets || []).map((t) => t.id as string)
    const forwardOk = new Set<string>()
    const escortLogged = new Set<string>()
    if (ticketIds.length) {
      const { data: logs } = await admin
        .from('ticket_logs')
        .select('ticket_id, action_type, meta')
        .in('ticket_id', ticketIds)
        .in('action_type', ['FORWARDED_TO_PROFESSIONAL', 'WORKER_PROFESSIONAL_ESCORT'])
      for (const log of logs || []) {
        const tid = log.ticket_id as string
        if (log.action_type === 'WORKER_PROFESSIONAL_ESCORT') {
          escortLogged.add(tid)
        } else if (log.action_type === 'FORWARDED_TO_PROFESSIONAL') {
          const meta = (log.meta || {}) as { sms_sent?: number }
          if ((meta.sms_sent ?? 0) > 0) forwardOk.add(tid)
        }
      }
    }

    const stats = {
      firstAlerts: 0,
      managerReminders: 0,
      smsSent: 0,
      smsFailed: 0,
      skippedAssigned: 0,
      skippedProgressive: 0,
      capped: false,
    }

    for (const row of tickets ?? []) {
      const pid = row.project_id as string | null
      const clientId = row.client_id as string | null
      if (!pid || !clientId) continue

      // Do not SMS "unassigned SLA" when a worker is already assigned
      if (row.assigned_worker_id) {
        stats.skippedAssigned++
        continue
      }

      if (
        hasProgressiveAlternative({
          forwardSmsOk: forwardOk.has(row.id as string),
          escortLogged: escortLogged.has(row.id as string),
          ticketMetadata: row.ticket_metadata,
        })
      ) {
        stats.skippedProgressive++
        continue
      }

      const { data: project } = await admin
        .from('projects')
        .select('id, name, sla_hours, manager_phone')
        .eq('id', pid)
        .maybeSingle()
      if (!project) continue

      const clientCreds = await getClientCreds(admin, clientId)
      if (!clientCreds) continue

      const managerPhone =
        clientCreds.manager_phone?.trim() ||
        (project.manager_phone as string | null)?.trim() ||
        null

      const slaH: number = typeof project.sla_hours === 'number' ? project.sla_hours : 24
      const openHours = hoursAgo(row.created_at as string)
      const alerted = row.sla_alerted as boolean
      const alertedAt = row.sla_alerted_at as string | null
      const escalatedAt = row.escalated_at as string | null
      const projectName = (project.name as string) || ''
      const ticketNum = String(row.ticket_number)

      // ── 1. FIRST SLA ALERT — SMS to manager only ──
      if (!alerted && openHours >= slaH && managerPhone) {
        if (stats.firstAlerts >= MAX_FIRST_ALERTS_PER_RUN) {
          stats.capped = true
          continue
        }

        const msg =
          `SLA: תקלה #${ticketNum} ב${projectName}\n` +
          `פתוחה ${Math.floor(openHours)} שעות, מעבר ל-${slaH} שעות שהוגדרו, וללא עובד משויך.\n` +
          `${(row.description as string | null)?.slice(0, 80) ?? '-'}\n` +
          `בדקו בלוח הבקרה.`

        const sent = await sendManagerSlaSms(
          managerPhone,
          msg,
          clientCreds.sms_sender_name ?? null,
          'SLA-first',
          logger,
          row.id as string,
          clientId
        )
        if (sent) {
          stats.smsSent++
          // Mark alerted ONLY after successful send — failed SMS can retry next run
          await admin
            .from('tickets')
            .update({
              sla_alerted: true,
              sla_alerted_at: new Date().toISOString(),
            })
            .eq('id', row.id as string)
          stats.firstAlerts++
        } else {
          stats.smsFailed++
        }
      }

      // ── 2. MANAGER REMINDER — 24h after first successful alert ──
      if (alerted && alertedAt && !escalatedAt && hoursAgo(alertedAt) >= 24 && managerPhone) {
        const msg =
          `תזכורת SLA: תקלה #${ticketNum} ב${projectName}\n` +
          `עדיין פתוחה ${Math.floor(openHours)} שעות וללא עובד משויך.\n` +
          `${(row.description as string | null)?.slice(0, 80) ?? '-'}\n` +
          `נא לטפל בדחיפות.`

        const sent = await sendManagerSlaSms(
          managerPhone,
          msg,
          clientCreds.sms_sender_name ?? null,
          'SLA-reminder',
          logger,
          row.id as string,
          clientId
        )
        if (sent) {
          stats.smsSent++
          await admin
            .from('tickets')
            .update({ escalated_at: new Date().toISOString() })
            .eq('id', row.id as string)
          stats.managerReminders++
        } else {
          stats.smsFailed++
        }
      }
    }

    logger.info('CRON', 'sla-check done', stats)
    return NextResponse.json({ ok: true, ...stats })
  } catch (e) {
    logger.error('CRON', 'sla-check fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
