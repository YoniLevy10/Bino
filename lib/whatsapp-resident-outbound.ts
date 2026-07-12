import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendWhatsAppTemplateMessageWithCredentials,
  sendWhatsAppTextMessage,
  type WhatsAppFailureLog,
  type WhatsAppMetaError,
} from '@/lib/whatsapp-send'
import {
  extractMetaWaMessageId,
  isWithinWhatsAppSessionWindow,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { getLogger } from '@/lib/logging'
import { whatsAppMetaErrorHint } from '@/lib/whatsapp-meta-errors'

export type ResidentOutboundResult = {
  sent: boolean
  mode?: 'text' | 'template' | 'sms_fallback'
  errorMessage?: string
  metaErrorCode?: number
  metaHttpStatus?: number
  /** Template failed but free-text inside 24h window succeeded. */
  fallbackFromTemplate?: boolean
}

type Creds = {
  phoneNumberId: string
  accessToken: string
}

function metaFailureFields(err?: WhatsAppMetaError) {
  return {
    metaErrorCode: err?.metaCode,
    metaHttpStatus: err?.httpStatus,
    errorMessage: whatsAppMetaErrorHint(err?.metaCode, err?.httpStatus),
  }
}

/**
 * Send to a resident: free text inside Meta's 24h window; Utility template outside it (with fallback).
 * When `preferTemplate` is true — template first always; free text only as fallback inside 24h session.
 */
export async function sendResidentTextOrTemplate(
  admin: SupabaseClient,
  opts: {
    clientId: string
    phone: string
    textBody: string
    templateName: string
    templateParams: string[]
    templateLanguage?: string
    creds: Creds
    failureLog?: WhatsAppFailureLog
    persistOutbound?: boolean
    messageTypeForPersist?: string
    ticketId?: string | null
    /** Always try Meta template first; free text only as fallback inside 24h session. */
    preferTemplate?: boolean
  }
): Promise<ResidentOutboundResult> {
  const to = normalizePhone(opts.phone.trim())
  if (!to || to.startsWith('wa_test_')) {
    return { sent: false, errorMessage: 'מספר דייר לא תקין לשליחת WhatsApp' }
  }

  const creds = {
    phoneNumberId: opts.creds.phoneNumberId,
    accessToken: opts.creds.accessToken,
  }
  const failureLog = opts.failureLog ?? { clientId: opts.clientId }
  const lang = opts.templateLanguage ?? 'he'
  const logger = getLogger()

  const inSession = await isWithinWhatsAppSessionWindow(admin, opts.clientId, to)

  const tryText = async (logOnFailure = true): Promise<ResidentOutboundResult> => {
    const metaErr: { current?: WhatsAppMetaError } = {}
    const wa = await sendWhatsAppTextMessage(
      to,
      opts.textBody,
      creds,
      { ...failureLog, logOnFailure },
      metaErr
    )
    if (wa) {
      if (opts.persistOutbound) {
        void persistWhatsAppMessage(admin, {
          clientId: opts.clientId,
          phone: to,
          direction: 'out',
          body: opts.textBody,
          messageType: opts.messageTypeForPersist ?? 'text',
          waMessageId: extractMetaWaMessageId(wa),
          ticketId: opts.ticketId,
        })
      }
      return { sent: true, mode: 'text' }
    }
    return { sent: false, ...metaFailureFields(metaErr.current) }
  }

  const tryTemplate = async (logOnFailure = true): Promise<ResidentOutboundResult> => {
    const metaErr: { current?: WhatsAppMetaError } = {}
    logger.info('WA_SEND', 'trying Meta template', {
      clientId: opts.clientId,
      template: opts.templateName,
      to: `…${to.slice(-4)}`,
    })
    const wa = await sendWhatsAppTemplateMessageWithCredentials(
      to,
      opts.templateName,
      opts.templateParams,
      creds,
      lang,
      { ...failureLog, logOnFailure },
      metaErr
    )
    if (wa) {
      const preview = `[template:${opts.templateName}] ${opts.templateParams.join(' · ')}`
      if (opts.persistOutbound) {
        void persistWhatsAppMessage(admin, {
          clientId: opts.clientId,
          phone: to,
          direction: 'out',
          body: preview,
          messageType: 'template',
          waMessageId: extractMetaWaMessageId(wa),
          ticketId: opts.ticketId,
        })
      }
      return { sent: true, mode: 'template' }
    }
    return { sent: false, ...metaFailureFields(metaErr.current) }
  }

  if (opts.preferTemplate) {
    const templ = await tryTemplate(!inSession)
    if (templ.sent) return templ
    if (inSession) {
      const text = await tryText()
      if (text.sent) return { ...text, fallbackFromTemplate: true }
    }
    return {
      sent: false,
      errorMessage: templ.errorMessage ?? 'WhatsApp send failed (template and text)',
      metaErrorCode: templ.metaErrorCode,
      metaHttpStatus: templ.metaHttpStatus,
    }
  }

  if (inSession) {
    const text = await tryText()
    if (text.sent) return text
    const templ = await tryTemplate()
    if (templ.sent) return templ
    return {
      sent: false,
      errorMessage: text.errorMessage ?? templ.errorMessage ?? 'WhatsApp send failed (text and template)',
      metaErrorCode: text.metaErrorCode ?? templ.metaErrorCode,
      metaHttpStatus: text.metaHttpStatus ?? templ.metaHttpStatus,
    }
  }

  const templ = await tryTemplate()
  if (templ.sent) return templ
  const text = await tryText()
  if (text.sent) return { ...text, fallbackFromTemplate: true }
  return {
    sent: false,
    errorMessage: templ.errorMessage ?? text.errorMessage ?? 'WhatsApp send failed (template and text)',
    metaErrorCode: templ.metaErrorCode ?? text.metaErrorCode,
    metaHttpStatus: templ.metaHttpStatus ?? text.metaHttpStatus,
  }
}
