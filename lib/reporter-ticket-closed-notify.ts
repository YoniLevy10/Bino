import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveSmsTemplateMessage, resolveWhatsAppTemplateMessage } from '@/lib/whatsapp-templates'
import { getLogger } from '@/lib/logging'
import { sendResidentTextOrTemplate } from '@/lib/whatsapp-resident-outbound'
import { metaTemplateNameTicketClosed } from '@/lib/meta-whatsapp-pending-actions'
import { sendResidentSMS } from '@/lib/sms-send'
import { SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'
import { whatsAppConversationPhoneKey } from '@/lib/whatsapp-message-store'

export type ReporterClosedNotifyResult = {
  whatsappSent: boolean
  smsSent: boolean
  reporterHasPhone: boolean
  /** True when a close message for this phone and building already went out recently. */
  skipped?: boolean
  whatsappError?: string
  smsError?: string
}

/** Timeline row written only after a successful WhatsApp close send. */
export const RESIDENT_CLOSE_NOTIFY_LOG_ACTION = 'RESIDENT_CLOSE_NOTIFY'

/** Suppress a second close text for the same resident and building inside this window. */
export const CLOSE_NOTIFY_DEDUPE_WINDOW_MS = 15 * 60 * 1000

const RECENT_CLOSE_MESSAGE_LIMIT = 20

const TICKET_CLOSED_WA_FALLBACK =
  'שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.\n\nאם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.'

const CLOSE_BODY_MARKERS = ['טופלה וסגורה', 'טופלה ונסגרה'] as const

function resolveProjectName(
  projects: { name?: string | null } | { name?: string | null }[] | null | undefined
): string {
  const proj = projects
  const name = Array.isArray(proj) ? proj[0]?.name : proj?.name
  return name?.trim() || 'הבניין'
}

/**
 * A recent outbound row counts only when it is a close notice for this building.
 * Other buildings, and ordinary replies that mention the building, do not match.
 */
export function isRecentCloseNotifyForBuilding(
  bodies: Array<string | null | undefined>,
  building: string,
  templateName: string
): boolean {
  const buildingKey = building.trim()
  if (!buildingKey) return false
  const templateMarker = `[template:${templateName}]`
  for (const raw of bodies) {
    const body = raw?.trim()
    if (!body || !body.includes(buildingKey)) continue
    if (body.includes(templateMarker)) return true
    if (CLOSE_BODY_MARKERS.some((marker) => body.includes(marker))) return true
  }
  return false
}

type RecentCloseLookup = 'recent' | 'none' | 'lookup_error'

async function findRecentCloseForBuilding(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  building: string,
  templateName: string
): Promise<RecentCloseLookup> {
  try {
    const phoneKey = whatsAppConversationPhoneKey(phone)
    if (!phoneKey) return 'none'

    const { data: conv, error: convErr } = await admin
      .from('whatsapp_conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('phone', phoneKey)
      .maybeSingle()

    if (convErr) return 'lookup_error'
    const conversationId = (conv as { id?: string } | null)?.id
    if (!conversationId) return 'none'

    const since = new Date(Date.now() - CLOSE_NOTIFY_DEDUPE_WINDOW_MS).toISOString()
    const { data: rows, error: msgErr } = await admin
      .from('whatsapp_messages')
      .select('body')
      .eq('client_id', clientId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'out')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(RECENT_CLOSE_MESSAGE_LIMIT)

    if (msgErr) return 'lookup_error'
    const bodies = ((rows ?? []) as Array<{ body?: string | null }>).map((row) => row.body)
    return isRecentCloseNotifyForBuilding(bodies, building, templateName) ? 'recent' : 'none'
  } catch {
    return 'lookup_error'
  }
}

async function tryResidentSmsFallback(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  reporterPhone: string,
  projectName: string
): Promise<{ smsSent: boolean; smsError?: string }> {
  const { data: clientRow } = await supabaseAdmin
    .from('clients')
    .select('sms_on_ticket_close, sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  const smsOnClose =
    (clientRow as { sms_on_ticket_close?: boolean | null } | null)?.sms_on_ticket_close !== false
  if (!smsOnClose) {
    return { smsSent: false, smsError: 'SMS on ticket close disabled for client' }
  }

  const smsSenderName = (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name ?? null
  const smsBody = await resolveSmsTemplateMessage(
    supabaseAdmin,
    clientId,
    'sms_resident_ticket_closed',
    SMS_TEMPLATE_EDITOR_DEFAULTS.sms_resident_ticket_closed,
    { project_name: projectName }
  )

  const smsSent = await sendResidentSMS(reporterPhone, smsBody, smsSenderName, clientId)
  if (!smsSent) {
    return { smsSent: false, smsError: 'SMS send failed' }
  }
  return { smsSent: true }
}

async function recordCloseNotifyLog(
  supabaseAdmin: SupabaseClient,
  ticketId: string
): Promise<void> {
  const logger = getLogger()
  try {
    const { error } = await supabaseAdmin.from('ticket_logs').insert({
      ticket_id: ticketId,
      action_type: RESIDENT_CLOSE_NOTIFY_LOG_ACTION,
      new_value: 'CLOSED',
      performed_by: 'system',
      notes: 'נשלח לדייר',
    })
    if (error) {
      logger.warn('WA_SEND', 'ticket_closed notify log insert failed', {
        ticketId,
        error: error.message,
      })
    }
  } catch (e) {
    logger.warn('WA_SEND', 'ticket_closed notify log insert threw', {
      ticketId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

async function logCloseNotifyFailure(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string | undefined,
  result: ReporterClosedNotifyResult
): Promise<void> {
  const logger = getLogger()
  const message = (result.whatsappError || result.smsError || 'ticket closed notify failed').slice(0, 2000)
  try {
    const { error } = await supabaseAdmin.from('system_logs').insert({
      level: 'error',
      source: 'ticket_closed_notify',
      message,
      payload: {
        clientId,
        ticketId: ticketId ?? null,
        whatsappError: result.whatsappError ?? null,
        smsError: result.smsError ?? null,
      },
    })
    if (error) {
      logger.warn('WA_SEND', 'ticket_closed notify failure log insert failed', {
        clientId,
        ticketId,
        error: error.message,
      })
    }
  } catch (e) {
    logger.warn('WA_SEND', 'ticket_closed notify failure log insert threw', {
      clientId,
      ticketId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * After a ticket is CLOSED: notify the reporter on WhatsApp (if configured).
 * Free text inside Meta's 24h window; Utility template outside it.
 * Falls back to SMS when WhatsApp cannot be delivered and sms_on_ticket_close is enabled.
 * Skips a second close notice for the same phone and building within 15 minutes.
 * Non-throwing — failures are returned in the result for logging.
 */
export async function notifyReporterTicketClosed(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  opts: {
    reporterPhone: string | null | undefined
    projectName: string
    ticketId?: string | null
  }
): Promise<ReporterClosedNotifyResult> {
  const reporterPhone = opts.reporterPhone?.trim()
  const result: ReporterClosedNotifyResult = {
    whatsappSent: false,
    smsSent: false,
    reporterHasPhone: Boolean(reporterPhone),
  }

  if (!reporterPhone) {
    return result
  }

  const building = opts.projectName?.trim() || 'הבניין'
  const logger = getLogger()
  const ticketId = opts.ticketId?.trim() || undefined
  const templateName = metaTemplateNameTicketClosed()

  const recent = await findRecentCloseForBuilding(
    supabaseAdmin,
    clientId,
    reporterPhone,
    building,
    templateName
  )
  if (recent === 'lookup_error') {
    logger.warn('WA_SEND', 'ticket_closed dedupe lookup failed, sending anyway', {
      clientId,
      ticketId,
    })
  } else if (recent === 'recent') {
    logger.info('WA_SEND', 'ticket_closed notify skipped, recent close for same building', {
      clientId,
      ticketId,
    })
    return { ...result, skipped: true }
  }

  const { data: waClient } = await supabaseAdmin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', clientId)
    .maybeSingle()

  const phoneNumberId = (waClient as { whatsapp_phone_number_id?: string | null } | null)?.whatsapp_phone_number_id
  const accessToken = (waClient as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    result.whatsappError = 'WhatsApp credentials missing for client'
  } else {
    try {
      const waBody = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        clientId,
        'ticket_closed',
        TICKET_CLOSED_WA_FALLBACK,
        { project_name: building }
      )

      const send = await sendResidentTextOrTemplate(supabaseAdmin, {
        clientId,
        phone: reporterPhone,
        textBody: waBody,
        templateName,
        templateParams: [building],
        creds: { phoneNumberId, accessToken },
        failureLog: { clientId },
        persistOutbound: true,
        messageTypeForPersist: 'text',
        ticketId: ticketId ?? null,
      })

      result.whatsappSent = send.sent
      if (!send.sent) {
        result.whatsappError = send.errorMessage ?? 'WhatsApp send failed (text and template)'
        logger.warn('WA_SEND', 'ticket_closed notify failed', {
          clientId,
          ticketId,
          mode: send.mode,
          error: result.whatsappError,
          metaCode: send.metaErrorCode,
        })
      } else {
        logger.info('WA_SEND', 'ticket_closed notify sent', {
          clientId,
          ticketId,
          mode: send.mode,
        })
        if (ticketId) {
          await recordCloseNotifyLog(supabaseAdmin, ticketId)
        }
      }
    } catch (e) {
      result.whatsappError = e instanceof Error ? e.message : String(e)
    }
  }

  if (!result.whatsappSent) {
    try {
      const sms = await tryResidentSmsFallback(supabaseAdmin, clientId, reporterPhone, building)
      result.smsSent = sms.smsSent
      if (sms.smsError) result.smsError = sms.smsError
      if (sms.smsSent) {
        logger.info('SMS_SEND', 'ticket_closed resident SMS fallback sent', { clientId, ticketId })
      } else if (sms.smsError && sms.smsError !== 'SMS on ticket close disabled for client') {
        logger.warn('SMS_SEND', 'ticket_closed resident SMS fallback failed', {
          clientId,
          ticketId,
          error: sms.smsError,
        })
      }
    } catch (e) {
      result.smsError = e instanceof Error ? e.message : String(e)
      logger.warn('SMS_SEND', 'ticket_closed resident SMS fallback failed', {
        clientId,
        ticketId,
        error: result.smsError,
      })
    }
  }

  if (!result.whatsappSent && !result.smsSent) {
    await logCloseNotifyFailure(supabaseAdmin, clientId, ticketId, result)
  }

  return result
}

/**
 * Notify reporter when status transitions to CLOSED (idempotent if already closed).
 */
export async function notifyReporterIfTicketNewlyClosed(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  previousStatus: string | null | undefined
): Promise<ReporterClosedNotifyResult | null> {
  if (previousStatus === 'CLOSED') return null

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select('status, reporter_phone, projects(name)')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !ticket || (ticket as { status?: string }).status !== 'CLOSED') {
    return null
  }

  const row = ticket as {
    reporter_phone?: string | null
    projects?: { name?: string | null } | { name?: string | null }[] | null
  }

  return notifyReporterTicketClosed(supabaseAdmin, clientId, {
    reporterPhone: row.reporter_phone,
    projectName: resolveProjectName(row.projects),
    ticketId,
  })
}
