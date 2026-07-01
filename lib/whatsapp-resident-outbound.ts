import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendWhatsAppTemplateMessageWithCredentials,
  sendWhatsAppTextMessage,
  type WhatsAppFailureLog,
} from '@/lib/whatsapp-send'
import {
  extractMetaWaMessageId,
  isWithinWhatsAppSessionWindow,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { getLogger } from '@/lib/logging'

export type ResidentOutboundResult = {
  sent: boolean
  mode?: 'text' | 'template'
  errorMessage?: string
  metaErrorCode?: number
}

type Creds = {
  phoneNumberId: string
  accessToken: string
}

function metaErrorHint(code: number | undefined): string {
  if (code === 131047) return 'חלון 24 שעות פג — נדרשת תבנית Meta מאושרת'
  if (code === 132001) return 'תבנית Meta לא קיימת או לא מאושרת'
  if (code === 190) return 'טוקן WhatsApp פג — עדכנו בהגדרות'
  if (code === 131026) return 'לא ניתן לשלוח למספר זה'
  return 'שליחת WhatsApp נכשלה'
}

/**
 * Send to a resident: free text inside Meta's 24h window; Utility template outside it (with fallback).
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

  const tryText = async (): Promise<ResidentOutboundResult> => {
    const wa = await sendWhatsAppTextMessage(to, opts.textBody, creds, failureLog)
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
    return { sent: false, errorMessage: metaErrorHint(131047) }
  }

  const tryTemplate = async (): Promise<ResidentOutboundResult> => {
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
      failureLog
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
    return { sent: false, errorMessage: metaErrorHint(132001), metaErrorCode: 132001 }
  }

  if (inSession) {
    const text = await tryText()
    if (text.sent) return text
    const templ = await tryTemplate()
    if (templ.sent) return templ
    return {
      sent: false,
      errorMessage: 'WhatsApp send failed (text and template)',
    }
  }

  const templ = await tryTemplate()
  if (templ.sent) return templ
  const text = await tryText()
  if (text.sent) return text
  return {
    sent: false,
    errorMessage: templ.errorMessage ?? 'WhatsApp send failed (template and text)',
    metaErrorCode: templ.metaErrorCode,
  }
}
