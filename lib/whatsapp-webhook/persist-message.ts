import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractMetaWaMessageId,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { sendWhatsAppInteractivePayloadWithCredentials } from '@/lib/whatsapp-send'
import { buildProjectSelectionListPayload } from '@/lib/whatsapp-interactive'
import type { ProjectRow } from '@/lib/whatsapp-interactive'

export type WebhookOutboundPersisters = {
  persistOutboundText: (
    phone: string,
    body: string,
    waResponse: Record<string, unknown> | null,
    messageType?: string
  ) => void
  sendInteractiveProjectList: (
    to: string,
    projects: ProjectRow[],
    bodyText: string,
    creds?: { phoneNumberId?: string; accessToken?: string }
  ) => Promise<Record<string, unknown> | null>
}

export function createWebhookOutboundPersisters(
  admin: SupabaseClient,
  clientId: string,
  fromPhone: string
): WebhookOutboundPersisters {
  return {
    persistOutboundText(phone, body, waResponse, messageType = 'text') {
      void persistWhatsAppMessage(admin, {
        clientId,
        phone,
        direction: 'out',
        body,
        messageType,
        waMessageId: extractMetaWaMessageId(waResponse),
      })
    },

    async sendInteractiveProjectList(to, projects, bodyText, creds) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const payload = buildProjectSelectionListPayload(to, projects, bodyText)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(admin, {
        clientId,
        phone: fromPhone,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    },
  }
}
