import { isShabbatMessagingSkipMessage } from '@/lib/shabbat-messaging-gate'

export type WhatsAppMetaError = {
  httpStatus: number
  metaCode?: number
  message?: string
}

/** error_logs.details.skip_status when deferring send until after Shabbat. */
export const WHATSAPP_SKIP_STATUS_SHABBAT = 'skipped_shabbat' as const

export function whatsAppMetaErrorHint(code: number | undefined, httpStatus?: number): string {
  if (httpStatus === 404) return 'Meta החזיר 404 — בדקו whatsapp_phone_number_id או שם תבנית'
  if (httpStatus === 0) return 'timeout או שגיאת רשת'
  if (code === 131047) return 'לא ניתן לשלוח ב-WhatsApp כרגע — נסו שוב או פנו למשרד'
  if (code === 132001) return 'תבנית Meta לא קיימת או לא מאושרת — צרו/אשרו ב-Meta Business Manager'
  if (code === 190) return 'טוקן WhatsApp פג — עדכנו whatsapp_access_token בהגדרות'
  if (code === 131026) return 'לא ניתן לשלוח למספר זה'
  if (code === 132000) return 'פרמטרים לא תואמים לתבנית'
  if (code === 132018) {
    return 'פרמטרי התבנית לא תקינים (שורה חדשה/רווחים/מספר שדות) — בדקו את תוכן המשתנים'
  }
  if (code === 132015) return 'תבנית paused או disabled ב-Meta'
  return 'שליחת WhatsApp נכשלה'
}

export function isWhatsAppShabbatSkip(meta?: WhatsAppMetaError | null): boolean {
  return isShabbatMessagingSkipMessage(meta?.message)
}

/** Meta errors that cron retry cannot fix without manual intervention. */
export function isNonRetryableWhatsAppMetaError(code: number | undefined): boolean {
  if (code == null) return false
  return [132001, 190, 100, 132000, 132015, 132018, 131026].includes(code)
}

/** Timeout / network — safe to retry immediately (and via cron). */
export function isTransientWhatsAppSendFailure(meta?: WhatsAppMetaError): boolean {
  if (!meta) return false
  if (meta.httpStatus === 0) return true
  const msg = meta.message?.trim().toLowerCase() ?? ''
  return msg === 'timeout' || msg.includes('network') || msg.includes('fetch failed')
}

export function formatWhatsAppTextFailureMessage(meta?: WhatsAppMetaError): string {
  if (isWhatsAppShabbatSkip(meta) && meta?.message?.trim()) {
    return meta.message.trim()
  }
  const hint = whatsAppMetaErrorHint(meta?.metaCode, meta?.httpStatus)
  if (meta?.httpStatus === 0 || meta?.message === 'timeout') {
    return 'WhatsApp send returned null (timeout/error)'
  }
  const parts = [`WhatsApp send failed: ${hint}`]
  if (meta?.metaCode != null) parts.push(`(קוד Meta ${meta.metaCode})`)
  if (meta?.message?.trim()) parts.push(`— ${meta.message.trim()}`)
  return parts.join(' ')
}

export function formatWhatsAppTemplateFailureMessage(
  templateName: string,
  meta?: WhatsAppMetaError
): string {
  if (isWhatsAppShabbatSkip(meta) && meta?.message?.trim()) {
    return `תבנית "${templateName}": ${meta.message.trim()}`
  }
  const hint = whatsAppMetaErrorHint(meta?.metaCode, meta?.httpStatus)
  const parts = [`תבנית "${templateName}": ${hint}`]
  if (meta?.metaCode != null) parts.push(`(קוד Meta ${meta.metaCode})`)
  if (meta?.message?.trim()) parts.push(`— ${meta.message.trim()}`)
  return parts.join(' ')
}

/** Meta Cloud API success body → wamid for ops verification. */
export function extractWhatsAppMessageId(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null
  const messages = data.messages
  if (!Array.isArray(messages) || messages.length === 0) return null
  const first = messages[0]
  if (!first || typeof first !== 'object') return null
  const id = (first as { id?: unknown }).id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

export function resolveWhatsAppRetryTemplateName(details: {
  body?: string
  template_name?: string
  send_kind?: string
}): string {
  const explicit = details.template_name?.trim()
  if (explicit && /^[a-z0-9_]+$/.test(explicit)) return explicit
  const body = details.body?.trim()
  if (body && /^[a-z0-9_]+$/.test(body)) return body
  return ''
}

/** Free-text outbound kinds logged to error_logs — retry as Cloud API text, not Meta templates. */
const FREE_TEXT_WHATSAPP_SEND_KINDS = new Set([
  'text',
  'ticket_reply',
  'worker_ticket_reply',
])

const TEMPLATE_WHATSAPP_SEND_KINDS = new Set(['template', 'image_template'])

/**
 * Whether whatsapp-retry should rebuild a text message from `details.body`.
 * Template names are only required for template / image_template (or legacy body=slug) rows.
 */
export function isWhatsAppFreeTextRetry(details: {
  body?: string
  template_name?: string
  send_kind?: string
}): boolean {
  const body = details.body?.trim() ?? ''
  if (!body) return false

  const sendKind = details.send_kind?.trim() ?? ''
  if (TEMPLATE_WHATSAPP_SEND_KINDS.has(sendKind)) return false

  if (FREE_TEXT_WHATSAPP_SEND_KINDS.has(sendKind)) return true

  // Explicit template_name means template retry even if send_kind was omitted/unknown.
  if (resolveWhatsAppRetryTemplateName({ ...details, body: undefined })) return false

  // Legacy rows without send_kind: Hebrew/free text body → text; ascii slug → template.
  if (!sendKind) return !/^[a-z0-9_]+$/.test(body)

  // Unknown send_kind with a free-text body and no template name (e.g. worker_completion_image caption).
  return !resolveWhatsAppRetryTemplateName(details)
}
