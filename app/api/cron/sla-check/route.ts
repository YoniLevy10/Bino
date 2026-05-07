import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import { sendManagerSMS } from '@/lib/sms-send'
import { getLogger } from '@/lib/logging'

function hoursAgo(ts: string): number {
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 3_600_000
}

type ClientCreds = {
  manager_phone: string | null
  whatsapp_phone_number_id: string | null
  whatsapp_access_token: string | null
  sms_sender_name: string | null
}

async function getClientCreds(admin: ReturnType<typeof getSupabaseAdmin>, clientId: string): Promise<ClientCreds | null> {
  const { data } = await admin
    .from('clients')
    .select('manager_phone, whatsapp_phone_number_id, whatsapp_access_token, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()
  return data as ClientCreds | null
}

async function sendAlert(
  phone: string,
  message: string,
  creds: ClientCreds,
  label: string,
  logger: ReturnType<typeof getLogger>,
  ticketId: string
): Promise<'wa' | 'sms' | 'none'> {
  const waCreds = creds.whatsapp_phone_number_id && creds.whatsapp_access_token
    ? { phoneNumberId: creds.whatsapp_phone_number_id, accessToken: creds.whatsapp_access_token }
    : null

  if (waCreds) {
    try {
      await sendWhatsAppTextMessage(phone, message, waCreds, { clientId: '' })
      return 'wa'
    } catch (e) {
      logger.warn('CRON', `${label} WA failed, trying SMS`, { ticketId, err: e instanceof Error ? e.message : String(e) })
    }
  }

  // SMS fallback
  try {
    await sendManagerSMS(phone, message, creds.sms_sender_name ?? null, null)
    return 'sms'
  } catch (e) {
    logger.warn('CRON', `${label} SMS also failed`, { ticketId, err: e instanceof Error ? e.message : String(e) })
    return 'none'
  }
}

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()

    // Fetch all open, non-deleted tickets
    const { data: tickets, error } = await admin
      .from('tickets')
      .select('id, ticket_number, created_at, project_id, client_id, reporter_phone, sla_alerted, sla_alerted_at, escalated_at, description')
      .is('deleted_at', null)
      .neq('status', 'CLOSED')

    if (error) {
      logger.error('CRON', 'sla-check tickets query failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const stats = { firstAlerts: 0, escalations: 0, wasSent: 0, smsSent: 0 }

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
        (project.manager_phone as string | null)?.trim() ||
        clientCreds.manager_phone?.trim() ||
        null

      const slaH: number = typeof project.sla_hours === 'number' ? project.sla_hours : 24
      const openHours = hoursAgo(row.created_at as string)
      const alerted = row.sla_alerted as boolean
      const alertedAt = row.sla_alerted_at as string | null
      const escalatedAt = row.escalated_at as string | null
      const projectName = (project.name as string) || ''
      const ticketNum = String(row.ticket_number)
      const reporterPhone = (row.reporter_phone as string | null)?.trim() || null

      // ── 1. FIRST SLA ALERT ──────────────────────────────────────────────────
      if (!alerted && openHours >= slaH && managerPhone) {
        const msg =
          `⏰ התראת SLA — תקלה #${ticketNum} בפרויקט ${projectName}\n` +
          `פתוחה כבר ${Math.floor(openHours)} שעות ללא טיפול.\n` +
          `תיאור: ${(row.description as string | null)?.slice(0, 80) ?? '—'}\n` +
          `נא לבדוק בלוח הבקרה.`

        const channel = await sendAlert(managerPhone, msg, clientCreds, 'SLA-first', logger, row.id as string)
        if (channel !== 'none') stats.wasSent += channel === 'wa' ? 1 : 0, stats.smsSent += channel === 'sms' ? 1 : 0

        await admin.from('tickets').update({
          sla_alerted: true,
          sla_alerted_at: new Date().toISOString(),
        }).eq('id', row.id as string)
        stats.firstAlerts++
      }

      // ── 2. ESCALATION — 24h after first alert ───────────────────────────────
      if (alerted && alertedAt && !escalatedAt && hoursAgo(alertedAt) >= 24) {
        // SMS to manager
        if (managerPhone) {
          const mgrMsg =
            `🚨 הסלמה — תקלה #${ticketNum} בפרויקט ${projectName}\n` +
            `עברו ${Math.floor(openHours)} שעות מפתיחת התקלה ועדיין אין טיפול.\n` +
            `נדרשת התערבות מיידית.`

          const ch = await sendAlert(managerPhone, mgrMsg, clientCreds, 'Escalation-mgr', logger, row.id as string)
          if (ch !== 'none') stats.wasSent += ch === 'wa' ? 1 : 0, stats.smsSent += ch === 'sms' ? 1 : 0
        }

        // WhatsApp to resident
        if (reporterPhone && clientCreds.whatsapp_phone_number_id && clientCreds.whatsapp_access_token) {
          try {
            const residentMsg =
              `שלום! הפנייה שלך #${ticketNum} בנושא "${(row.description as string | null)?.slice(0, 60) ?? '—'}" עדיין בטיפול.\n` +
              `אנחנו מטפלים בה — תודה על הסבלנות 🙏`
            await sendWhatsAppTextMessage(
              reporterPhone,
              residentMsg,
              { phoneNumberId: clientCreds.whatsapp_phone_number_id, accessToken: clientCreds.whatsapp_access_token },
              { clientId }
            )
          } catch (e) {
            logger.warn('CRON', 'Escalation resident WA failed', { ticketId: row.id, err: e instanceof Error ? e.message : String(e) })
          }
        }

        await admin.from('tickets').update({ escalated_at: new Date().toISOString() }).eq('id', row.id as string)
        stats.escalations++
      }
    }

    logger.info('CRON', 'sla-check done', stats)
    return NextResponse.json({ ok: true, ...stats })
  } catch (e) {
    logger.error('CRON', 'sla-check fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
