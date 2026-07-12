import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendManagerSMS } from '@/lib/sms-send'
import { getLogger } from '@/lib/logging'
import { isOutboundMessagingBlocked } from '@/lib/shabbat-messaging-gate'

/** Cap first-time SLA alerts per cron run to avoid backlog bursts. */
const MAX_FIRST_ALERTS_PER_RUN = 10
/** Ignore very old open tickets that pre-date SLA tracking. */
const SLA_TICKET_MAX_AGE_DAYS = 90

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

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isOutboundMessagingBlocked()) {
    logger.info('CRON', 'sla-check skipped — Shabbat')
    return NextResponse.json({ ok: true, skipped: 'shabbat', firstAlerts: 0, managerReminders: 0, smsSent: 0 })
  }

  try {
    const admin = getSupabaseAdmin()
    const minCreatedAt = new Date(Date.now() - SLA_TICKET_MAX_AGE_DAYS * 86_400_000).toISOString()

    const { data: tickets, error } = await admin
      .from('tickets')
      .select('id, ticket_number, created_at, project_id, client_id, sla_alerted, sla_alerted_at, escalated_at, description')
      .is('deleted_at', null)
      .neq('status', 'CLOSED')
      .gte('created_at', minCreatedAt)

    if (error) {
      logger.error('CRON', 'sla-check tickets query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const stats = { firstAlerts: 0, managerReminders: 0, smsSent: 0, capped: false }

    for (const row of tickets ?? []) {
      const pid = row.project_id as string | null
      const clientId = row.client_id as string | null
      if (!pid || !clientId) continue

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
          `פתוחה ${Math.floor(openHours)} שעות ללא טיפול.\n` +
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
        if (sent) stats.smsSent++

        await admin.from('tickets').update({
          sla_alerted: true,
          sla_alerted_at: new Date().toISOString(),
        }).eq('id', row.id as string)
        stats.firstAlerts++
      }

      // ── 2. MANAGER REMINDER — 24h after first alert (no resident messages) ──
      if (alerted && alertedAt && !escalatedAt && hoursAgo(alertedAt) >= 24 && managerPhone) {
        const msg =
          `תזכורת SLA: תקלה #${ticketNum} ב${projectName}\n` +
          `עדיין פתוחה ${Math.floor(openHours)} שעות.\n` +
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
        if (sent) stats.smsSent++

        await admin.from('tickets').update({ escalated_at: new Date().toISOString() }).eq('id', row.id as string)
        stats.managerReminders++
      }
    }

    logger.info('CRON', 'sla-check done', stats)
    return NextResponse.json({ ok: true, ...stats })
  } catch (e) {
    logger.error('CRON', 'sla-check fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
