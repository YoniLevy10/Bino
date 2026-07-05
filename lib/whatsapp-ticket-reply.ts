import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { sendResidentSMS } from '@/lib/sms-send'
import { sendResidentTextOrTemplate, type ResidentOutboundResult } from '@/lib/whatsapp-resident-outbound'
import { loadWhatsAppInboxContext, managerReplyTemplateParams } from '@/lib/whatsapp-inbox-context'
import { metaTemplateNameManagerReply } from '@/lib/meta-whatsapp-pending-actions'
import {
  extractMetaWaMessageId,
  isWithinWhatsAppSessionWindow,
  listWhatsAppMessagesForPhone,
  loadWhatsAppThreadForPhone,
  persistWhatsAppMessage,
  type WhatsAppThreadLoadResult,
} from '@/lib/whatsapp-message-store'
import {
  sendWhatsAppImageMessageWithCredentials,
  sendWhatsAppImageTemplateMessageWithCredentials,
  type WhatsAppMetaError,
} from '@/lib/whatsapp-send'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { metaTemplateNameWorkerCompletionPhoto } from '@/lib/meta-whatsapp-pending-actions'
import { getLogger } from '@/lib/logging'

export type TicketReplySendResult = ResidentOutboundResult & {
  reporterPhone?: string
}

const WHATSAPP_TICKET_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000

/** Resident opened this ticket via WhatsApp recently — Meta session usually still open. */
export function isRecentWhatsAppTicketReport(ticket: {
  source?: string | null
  created_at?: string | null
} | null | undefined): boolean {
  if (ticket?.source !== 'whatsapp' || !ticket.created_at) return false
  const ageMs = Date.now() - new Date(ticket.created_at).getTime()
  return ageMs >= 0 && ageMs < WHATSAPP_TICKET_REPORT_WINDOW_MS
}

async function fetchTicketReplyContext(
  admin: SupabaseClient,
  ticketId: string,
  clientId: string
): Promise<{
  reporter_phone: string | null
  ticket_number: number | null
  source: string | null
  created_at: string | null
} | null> {
  const { data } = await admin
    .from('tickets')
    .select('reporter_phone, ticket_number, source, created_at')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) return null
  return data as {
    reporter_phone: string | null
    ticket_number: number | null
    source: string | null
    created_at: string | null
  }
}

async function tryResidentSmsTicketReplyFallback(
  admin: SupabaseClient,
  opts: {
    clientId: string
    reporterPhone: string
    ticketNumber: number | null
    body: string
  }
): Promise<boolean> {
  const { data: clientRow } = await admin
    .from('clients')
    .select('sms_sender_name')
    .eq('id', opts.clientId)
    .maybeSingle()

  const smsSenderName =
    (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null
  const ticketLabel = opts.ticketNumber ? ` #${opts.ticketNumber}` : ''
  const smsBody = `עדכון בנושא הפנייה${ticketLabel}: ${opts.body}`.slice(0, 480)

  return sendResidentSMS(opts.reporterPhone, smsBody, smsSenderName, opts.clientId)
}

export async function fetchTicketReporterPhone(
  admin: SupabaseClient,
  ticketId: string,
  clientId: string
): Promise<string | null> {
  const { data } = await admin
    .from('tickets')
    .select('reporter_phone')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  const phone = normalizePhone((data?.reporter_phone as string | null) ?? '')
  if (!phone || phone.startsWith('wa_test_')) return null
  return phone
}

export async function sendTicketResidentWhatsAppReply(
  admin: SupabaseClient,
  opts: { clientId: string; ticketId: string; body: string }
): Promise<TicketReplySendResult> {
  const ticketCtx = await fetchTicketReplyContext(admin, opts.ticketId, opts.clientId)
  if (!ticketCtx) {
    return { sent: false, errorMessage: 'תקלה לא נמצאה' }
  }

  const reporterPhone = normalizePhone((ticketCtx.reporter_phone ?? '').trim())
  if (!reporterPhone || reporterPhone.startsWith('wa_test_')) {
    return { sent: false, errorMessage: 'אין טלפון דייר לתקלה זו' }
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', opts.clientId)
    .maybeSingle()

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    return { sent: false, errorMessage: 'WhatsApp לא מוגדר ללקוח' }
  }

  const messageBody = opts.body.trim().slice(0, 4096)
  if (!messageBody) {
    return { sent: false, errorMessage: 'הודעה ריקה' }
  }

  const inSession = await isWithinWhatsAppSessionWindow(admin, opts.clientId, reporterPhone)
  const recentlyReported = isRecentWhatsAppTicketReport(ticketCtx)
  // Resident already reported — we own follow-up. Free text first while Meta session is likely open.
  const tryFreeTextFirst = inSession || recentlyReported

  const ctx = await loadWhatsAppInboxContext(admin, opts.clientId, { phone: reporterPhone })
  const templateParams = managerReplyTemplateParams(ctx, messageBody)

  const result = await sendResidentTextOrTemplate(admin, {
    clientId: opts.clientId,
    phone: reporterPhone,
    textBody: messageBody,
    templateName: metaTemplateNameManagerReply(),
    templateParams,
    creds: { phoneNumberId, accessToken },
    failureLog: { clientId: opts.clientId, logOnFailure: !tryFreeTextFirst },
    persistOutbound: true,
    messageTypeForPersist: tryFreeTextFirst ? 'text' : 'template',
    ticketId: opts.ticketId,
    preferTemplate: !tryFreeTextFirst,
  })

  if (result.sent) {
    return { ...result, reporterPhone }
  }

  const smsSent = await tryResidentSmsTicketReplyFallback(admin, {
    clientId: opts.clientId,
    reporterPhone,
    ticketNumber: ticketCtx.ticket_number,
    body: messageBody,
  })

  if (smsSent) {
    return { sent: true, mode: 'sms_fallback', reporterPhone }
  }

  return { ...result, reporterPhone }
}

export type TicketImageSendResult = {
  sent: boolean
  reporterPhone?: string
  errorMessage?: string
  metaErrorCode?: number
  mode?: 'text_image' | 'template_image'
}

async function fetchTicketProjectName(
  admin: SupabaseClient,
  ticketId: string,
  clientId: string
): Promise<string> {
  const { data } = await admin
    .from('tickets')
    .select('projects(name)')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  const projects = (data as { projects?: { name?: string | null } | { name?: string | null }[] | null } | null)
    ?.projects
  const name = Array.isArray(projects) ? projects[0]?.name : projects?.name
  return name?.trim() || 'הבניין'
}

export async function sendTicketResidentWhatsAppImage(
  admin: SupabaseClient,
  opts: {
    clientId: string
    ticketId: string
    imageLink: string
    caption?: string
  }
): Promise<TicketImageSendResult> {
  const reporterPhone = await fetchTicketReporterPhone(admin, opts.ticketId, opts.clientId)
  if (!reporterPhone) {
    return { sent: false, errorMessage: 'אין טלפון דייר לתקלה זו' }
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', opts.clientId)
    .maybeSingle()

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    return { sent: false, reporterPhone, errorMessage: 'WhatsApp לא מוגדר ללקוח' }
  }

  const creds = { phoneNumberId, accessToken }
  const projectName = await fetchTicketProjectName(admin, opts.ticketId, opts.clientId)
  const caption = opts.caption?.trim() || 'התיקון בוצע. תודה על הדיווח.'
  const inSession = await isWithinWhatsAppSessionWindow(admin, opts.clientId, reporterPhone)
  const logger = getLogger()

  const persistImage = (mode: 'text_image' | 'template_image', wa: Record<string, unknown> | null) => {
    void persistWhatsAppMessage(admin, {
      clientId: opts.clientId,
      phone: reporterPhone,
      direction: 'out',
      body: mode === 'template_image' ? `[template:${metaTemplateNameWorkerCompletionPhoto()}] ${projectName}` : caption,
      messageType: 'image',
      waMessageId: extractMetaWaMessageId(wa),
      ticketId: opts.ticketId,
    })
  }

  if (inSession) {
    const metaErr: { current?: WhatsAppMetaError } = {}
    const wa = await sendWhatsAppImageMessageWithCredentials(
      phoneNumberId,
      accessToken,
      reporterPhone,
      opts.imageLink,
      caption,
      metaErr
    )

    if (wa) {
      persistImage('text_image', wa)
      return { sent: true, reporterPhone, mode: 'text_image' }
    }

    logger.warn('WA_SEND', 'completion image in-session failed, trying template', {
      clientId: opts.clientId,
      ticketId: opts.ticketId,
      error: metaErr.current?.message,
    })
  }

  const metaErr: { current?: WhatsAppMetaError } = {}
  const wa = await sendWhatsAppImageTemplateMessageWithCredentials(
    reporterPhone,
    metaTemplateNameWorkerCompletionPhoto(),
    opts.imageLink,
    [projectName],
    creds,
    'he',
    { clientId: opts.clientId },
    metaErr
  )

  if (wa) {
    persistImage('template_image', wa)
    logger.info('WA_SEND', 'completion image template sent', {
      clientId: opts.clientId,
      ticketId: opts.ticketId,
      inSession,
    })
    return { sent: true, reporterPhone, mode: 'template_image' }
  }

  const errorMessage = metaErr.current?.message ?? 'שליחת תמונה ב-WhatsApp נכשלה'
  await insertWhatsAppSendFailure(
    opts.clientId,
    reporterPhone,
    caption,
    errorMessage,
    {
      send_kind: 'worker_completion_image',
      ticket_id: opts.ticketId,
      meta_http_status: metaErr.current?.httpStatus,
      meta_error_code: metaErr.current?.metaCode,
    }
  )

  return {
    sent: false,
    reporterPhone,
    errorMessage,
    metaErrorCode: metaErr.current?.metaCode,
  }
}

export async function listTicketWhatsAppMessages(
  admin: SupabaseClient,
  clientId: string,
  ticketId: string
): Promise<WhatsAppThreadLoadResult> {
  const reporterPhone = await fetchTicketReporterPhone(admin, ticketId, clientId)
  if (!reporterPhone) return { conversation_id: null, messages: [] }
  return loadWhatsAppThreadForPhone(admin, clientId, reporterPhone)
}
