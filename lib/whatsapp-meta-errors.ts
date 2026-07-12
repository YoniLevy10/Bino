export type WhatsAppMetaError = {
  httpStatus: number
  metaCode?: number
  message?: string
}

export function whatsAppMetaErrorHint(code: number | undefined, httpStatus?: number): string {
  if (httpStatus === 404) return 'Meta החזיר 404 — בדקו whatsapp_phone_number_id או שם תבנית'
  if (httpStatus === 0) return 'timeout או שגיאת רשת'
  if (code === 131047) return 'לא ניתן לשלוח ב-WhatsApp כרגע — נסו שוב או פנו למשרד'
  if (code === 132001) return 'תבנית Meta לא קיימת או לא מאושרת — צרו/אשרו ב-Meta Business Manager'
  if (code === 190) return 'טוקן WhatsApp פג — עדכנו whatsapp_access_token בהגדרות'
  if (code === 131026) return 'לא ניתן לשלוח למספר זה'
  if (code === 132000) return 'פרמטרים לא תואמים לתבנית'
  if (code === 132015) return 'תבנית paused או disabled ב-Meta'
  return 'שליחת WhatsApp נכשלה'
}

/** Meta errors that cron retry cannot fix without manual intervention. */
export function isNonRetryableWhatsAppMetaError(code: number | undefined): boolean {
  if (code == null) return false
  return [132001, 190, 100, 132000, 132015, 131026].includes(code)
}

export function formatWhatsAppTemplateFailureMessage(
  templateName: string,
  meta?: WhatsAppMetaError
): string {
  const hint = whatsAppMetaErrorHint(meta?.metaCode, meta?.httpStatus)
  const parts = [`תבנית "${templateName}": ${hint}`]
  if (meta?.metaCode != null) parts.push(`(קוד Meta ${meta.metaCode})`)
  if (meta?.message?.trim()) parts.push(`— ${meta.message.trim()}`)
  return parts.join(' ')
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
