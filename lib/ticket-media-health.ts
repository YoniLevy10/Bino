import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getEnvReadinessFlags } from '@/lib/env-readiness'

export type HealthCheckStatus = 'ok' | 'degraded' | 'error'

export type TicketMediaHealthCheck = {
  id: string
  ok: boolean
  detail?: string
}

export type TicketMediaHealthReport = {
  status: HealthCheckStatus
  ts: string
  checks: TicketMediaHealthCheck[]
  issues: string[]
  metrics: {
    unresolved_media_errors_24h: number
    unresolved_ticket_create_errors_24h: number
    stuck_whatsapp_media_sessions: number
    whatsapp_clients_ok: number
    whatsapp_clients_total: number
  }
}

const GRAPH_API = 'https://graph.facebook.com/v23.0'

async function probeWhatsAppToken(
  phoneNumberId: string,
  accessToken: string
): Promise<'ok' | 'expired' | 'error'> {
  try {
    const resp = await fetchWithTimeout(
      `${GRAPH_API}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      8_000
    )
    if (!resp) return 'error'
    if (resp.ok) return 'ok'
    const body = (await resp.json().catch(() => ({}))) as { error?: { code?: number } }
    return body?.error?.code === 190 ? 'expired' : 'error'
  } catch {
    return 'error'
  }
}

function pushCheck(
  checks: TicketMediaHealthCheck[],
  issues: string[],
  id: string,
  ok: boolean,
  detail?: string,
  issue?: string
) {
  checks.push({ id, ok, detail })
  if (!ok && issue) issues.push(issue)
}

function deriveStatus(checks: TicketMediaHealthCheck[], issues: string[]): HealthCheckStatus {
  const critical = ['db_tickets', 'db_attachments', 'storage_bucket']
  if (critical.some((id) => checks.find((c) => c.id === id && !c.ok))) return 'error'
  if (issues.length > 0) return 'degraded'
  return 'ok'
}

/** Probes DB, storage, WhatsApp tokens, and recent ticket/media failure signals. */
export async function runTicketMediaHealthProbe(admin: SupabaseClient): Promise<TicketMediaHealthReport> {
  const ts = new Date().toISOString()
  const checks: TicketMediaHealthCheck[] = []
  const issues: string[] = []

  const { error: ticketsErr } = await admin.from('tickets').select('id').limit(1)
  pushCheck(
    checks,
    issues,
    'db_tickets',
    !ticketsErr,
    ticketsErr?.message,
    'טבלת תקלות (tickets) לא נגישה'
  )

  const { error: attachErr } = await admin.from('ticket_attachments').select('id').limit(1)
  pushCheck(
    checks,
    issues,
    'db_attachments',
    !attachErr,
    attachErr?.message,
    'טבלת קבצים מצורפים (ticket_attachments) לא נגישה'
  )

  const { error: storageErr } = await admin.storage.from('ticket-attachments').list('', { limit: 1 })
  pushCheck(
    checks,
    issues,
    'storage_bucket',
    !storageErr,
    storageErr?.message,
    'אחסון קבצים (ticket-attachments) לא זמין'
  )

  for (const flag of getEnvReadinessFlags()) {
    pushCheck(
      checks,
      issues,
      `env_${flag.key}`,
      flag.ok,
      flag.hint,
      flag.ok ? undefined : `משתנה סביבה חסר: ${flag.key}`
    )
  }

  const globalWaToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim()
  const globalWaPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
  if (globalWaToken && globalWaPhoneId) {
    const globalStatus = await probeWhatsAppToken(globalWaPhoneId, globalWaToken)
    pushCheck(
      checks,
      issues,
      'whatsapp_global_token',
      globalStatus === 'ok',
      globalStatus,
      globalStatus === 'ok' ? undefined : 'טוקן WhatsApp גלובלי לא תקין או פג תוקף'
    )
  }

  const { data: waClients } = await admin
    .from('clients')
    .select('id, name, whatsapp_phone_number_id, whatsapp_access_token')
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  let whatsappOk = 0
  const waTotal = waClients?.length ?? 0
  for (const client of waClients || []) {
    const status = await probeWhatsAppToken(
      client.whatsapp_phone_number_id as string,
      client.whatsapp_access_token as string
    )
    if (status === 'ok') whatsappOk += 1
    else {
      issues.push(
        `WhatsApp ללקוח «${(client.name as string) || client.id}»: ${
          status === 'expired' ? 'טוקן פג תוקף' : 'בדיקה נכשלה'
        }`
      )
    }
  }

  if (waTotal > 0 && whatsappOk === 0) {
    pushCheck(checks, issues, 'whatsapp_any_client', false, undefined, 'אף טוקן WhatsApp של לקוח לא תקין')
  } else {
    pushCheck(
      checks,
      issues,
      'whatsapp_any_client',
      waTotal === 0 ? true : whatsappOk > 0,
      waTotal === 0 ? 'no_wa_clients' : `${whatsappOk}/${waTotal}`,
      waTotal > 0 && whatsappOk === 0 ? undefined : undefined
    )
  }

  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString()

  const { count: mediaErrCount } = await admin
    .from('error_logs')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
    .gte('created_at', since24h)
    .or('context.ilike.%media%,context.ilike.%whatsapp_webhook:media%')

  const { count: ticketCreateErrCount } = await admin
    .from('error_logs')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
    .gte('created_at', since24h)
    .or('context.eq.whatsapp_webhook:ticket_create,context.ilike.%ticket_create%')
    .not('message', 'ilike', 'recent_duplicate_whatsapp_ticket%')

  const stuckSince = new Date(Date.now() - 2 * 3_600_000).toISOString()
  const { count: stuckMediaSessions } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .not('pending_whatsapp_media_id', 'is', null)
    .lt('last_activity_at', stuckSince)

  const unresolvedMedia = mediaErrCount ?? 0
  const unresolvedTicketCreate = ticketCreateErrCount ?? 0
  const stuckSessions = stuckMediaSessions ?? 0

  if (unresolvedMedia > 0) {
    issues.push(`${unresolvedMedia} כשלי מדיה לא פתורים ב-24 שעות האחרונות`)
  }
  if (unresolvedTicketCreate > 0) {
    issues.push(`${unresolvedTicketCreate} כשלי יצירת תקלה לא פתורים ב-24 שעות`)
  }
  if (stuckSessions > 0) {
    issues.push(`${stuckSessions} שיחות WhatsApp עם מדיה תקועה (מעל 2 שעות)`)
  }

  pushCheck(
    checks,
    issues,
    'recent_media_errors',
    unresolvedMedia === 0,
    String(unresolvedMedia),
    unresolvedMedia > 0 ? `${unresolvedMedia} כשלי מדיה פתוחים` : undefined
  )

  const status = deriveStatus(checks, issues)

  return {
    status,
    ts,
    checks,
    issues,
    metrics: {
      unresolved_media_errors_24h: unresolvedMedia,
      unresolved_ticket_create_errors_24h: unresolvedTicketCreate,
      stuck_whatsapp_media_sessions: stuckSessions,
      whatsapp_clients_ok: whatsappOk,
      whatsapp_clients_total: waTotal,
    },
  }
}
