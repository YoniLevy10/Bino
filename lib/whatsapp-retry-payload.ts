import { buildWhatsAppTemplatePayloadForRetry } from '@/lib/whatsapp-send'
import {
  isWhatsAppFreeTextRetry,
  resolveWhatsAppRetryTemplateName,
} from '@/lib/whatsapp-meta-errors'
import { sanitizeWhatsAppTemplateParam } from '@/lib/whatsapp-template-params'

export type WhatsAppRetryDetails = {
  client_id?: string
  to?: string
  body?: string
  send_kind?: 'text' | 'template' | 'image_template' | string
  template_name?: string
  template_params?: string[]
  template_language?: string
  header_image_link?: string
  meta_error_code?: number
  meta_http_status?: number
  meta_error_message?: string
}

/** Rebuild Meta Cloud API payload for whatsapp-retry cron from error_logs.details. */
export function buildWhatsAppRetryPayload(
  d: WhatsAppRetryDetails
): Record<string, unknown> | null {
  const to = d.to || ''

  if (isWhatsAppFreeTextRetry(d)) {
    return {
      to,
      type: 'text',
      text: { body: d.body || '' },
    }
  }

  const templateName = resolveWhatsAppRetryTemplateName(d)
  if (!templateName) return null

  const params = Array.isArray(d.template_params)
    ? d.template_params.map((p) => sanitizeWhatsAppTemplateParam(String(p)))
    : []
  const lang = d.template_language || 'he'

  if (d.send_kind === 'image_template' || d.header_image_link) {
    const components: Array<Record<string, unknown>> = []
    const headerImageLink = d.header_image_link?.trim()
    if (headerImageLink) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageLink } }],
      })
    }
    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text })),
      })
    }
    return {
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components,
      },
    }
  }

  return buildWhatsAppTemplatePayloadForRetry(to, templateName, params, lang)
}
