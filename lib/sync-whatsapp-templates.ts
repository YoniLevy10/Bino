import {
  WHATSAPP_TEMPLATE_EDITOR_DEFAULTS,
  WHATSAPP_TEMPLATE_KEYS,
  SMS_TEMPLATE_EDITOR_DEFAULTS,
  SMS_TEMPLATE_KEYS,
} from '@/lib/whatsapp-template-keys'

export type WhatsappTemplateRow = {
  client_id: string
  template_key: string
  template_text: string
  updated_at: string
}

/** Rows matching webhook/SMS code defaults — use for DB upsert to align tenant templates with live flow. */
export function buildFlowTemplateRowsForClient(clientId: string): WhatsappTemplateRow[] {
  const updated_at = new Date().toISOString()
  const wa: WhatsappTemplateRow[] = WHATSAPP_TEMPLATE_KEYS.map((key) => ({
    client_id: clientId,
    template_key: key,
    template_text: WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[key],
    updated_at,
  }))
  const sms: WhatsappTemplateRow[] = SMS_TEMPLATE_KEYS.map((key) => ({
    client_id: clientId,
    template_key: key,
    template_text: SMS_TEMPLATE_EDITOR_DEFAULTS[key],
    updated_at,
  }))
  return [...wa, ...sms]
}
