/**
 * Per-project resident intake survey — shareable link for WhatsApp building groups.
 * Max ~5 questions; creates/updates a row in `residents`.
 */

export type ResidentIntakeLinkParams = {
  projectCode: string
  clientId: string
  /** Prefer NEXT_PUBLIC_APP_URL; fall back to window origin in the browser. */
  baseUrl?: string
}

export function buildResidentIntakePath(projectCode: string, clientId: string): string {
  const code = projectCode.trim().toUpperCase()
  const client = clientId.trim()
  return `/intake?project=${encodeURIComponent(code)}&client=${encodeURIComponent(client)}`
}

export function buildResidentIntakeUrl(params: ResidentIntakeLinkParams): string {
  const path = buildResidentIntakePath(params.projectCode, params.clientId)
  const rawBase =
    (params.baseUrl || '').trim() ||
    (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_APP_URL || '').trim() : '') ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const base = rawBase.replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

/** Plain Hebrew text for managers to paste into a WhatsApp group (no emoji). */
export function buildResidentIntakeShareMessage(params: {
  projectName: string
  intakeUrl: string
}): string {
  const name = params.projectName.trim() || 'הבניין'
  return [
    `שלום,`,
    `אנא מלאו את פרטי הדייר בקישור הקצר הבא עבור ${name}.`,
    `זה לוקח פחות מדקה ועוזר לנו לעדכן את רשימת הדיירים במערכת התחזוקה.`,
    params.intakeUrl,
  ].join('\n')
}

/** Opens WhatsApp with prefilled text so the manager can pick a group/chat. */
export function buildResidentIntakeWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message.trim())}`
}
