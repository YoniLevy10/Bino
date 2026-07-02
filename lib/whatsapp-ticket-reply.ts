import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { sendResidentTextOrTemplate, type ResidentOutboundResult } from '@/lib/whatsapp-resident-outbound'
import { loadWhatsAppInboxContext, managerReplyTemplateParams } from '@/lib/whatsapp-inbox-context'
import { metaTemplateNameManagerReply } from '@/lib/meta-whatsapp-pending-actions'
import {
  extractMetaWaMessageId,
  listWhatsAppMessagesForPhone,
  loadWhatsAppThreadForPhone,
  persistWhatsAppMessage,
  type WhatsAppThreadLoadResult,
} from '@/lib/whatsapp-message-store'
import { sendWhatsAppImageMessageWithCredentials, type WhatsAppMetaError } from '@/lib/whatsapp-send'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'

export type TicketReplySendResult = ResidentOutboundResult & {
  reporterPhone?: string
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
    return { sent: false, errorMessage: 'WhatsApp לא מוגדר ללקוח' }
  }

  const messageBody = opts.body.trim().slice(0, 4096)
  if (!messageBody) {
    return { sent: false, errorMessage: 'הודעה ריקה' }
  }

  const ctx = await loadWhatsAppInboxContext(admin, opts.clientId, { phone: reporterPhone })
  const templateParams = managerReplyTemplateParams(ctx, messageBody)

  const result = await sendResidentTextOrTemplate(admin, {
    clientId: opts.clientId,
    phone: reporterPhone,
    textBody: messageBody,
    templateName: metaTemplateNameManagerReply(),
    templateParams,
    creds: { phoneNumberId, accessToken },
    failureLog: { clientId: opts.clientId },
    persistOutbound: true,
    messageTypeForPersist: 'template',
    ticketId: opts.ticketId,
    preferTemplate: true,
  })

  return { ...result, reporterPhone }
}

export type TicketImageSendResult = {
  sent: boolean
  reporterPhone?: string
  errorMessage?: string
  metaErrorCode?: number
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

  const metaErr: { current?: WhatsAppMetaError } = {}
  const wa = await sendWhatsAppImageMessageWithCredentials(
    phoneNumberId,
    accessToken,
    reporterPhone,
    opts.imageLink,
    opts.caption,
    metaErr
  )

  if (!wa) {
    const errorMessage = metaErr.current?.message ?? 'שליחת תמונה ב-WhatsApp נכשלה'
    await insertWhatsAppSendFailure(
      opts.clientId,
      reporterPhone,
      opts.caption ?? '[image]',
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

  void persistWhatsAppMessage(admin, {
    clientId: opts.clientId,
    phone: reporterPhone,
    direction: 'out',
    body: opts.caption?.trim() || 'תמונת סיום תיקון',
    messageType: 'image',
    waMessageId: extractMetaWaMessageId(wa),
    ticketId: opts.ticketId,
  })

  return { sent: true, reporterPhone }
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
