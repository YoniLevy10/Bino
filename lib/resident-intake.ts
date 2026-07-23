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

export const RESIDENT_INTAKE_SHARE_PLACEHOLDERS = {
  project: '{project}',
  url: '{url}',
} as const

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

/** Default WhatsApp-group template. Placeholders: {project}, {url} */
export function buildResidentIntakeShareTemplate(projectName?: string): string {
  const name = (projectName || '').trim() || 'הבניין'
  return [
    `שלום,`,
    `אנא מלאו את פרטי הדייר בקישור הקצר הבא עבור ${name}.`,
    `זה לוקח פחות מדקה ועוזר לנו לעדכן את רשימת הדיירים במערכת התחזוקה.`,
    `{url}`,
  ].join('\n')
}

/** Plain Hebrew text for managers to paste into a WhatsApp group (no emoji). */
export function buildResidentIntakeShareMessage(params: {
  projectName: string
  intakeUrl: string
}): string {
  return resolveResidentIntakeShareMessage(buildResidentIntakeShareTemplate(params.projectName), {
    projectName: params.projectName,
    intakeUrl: params.intakeUrl,
  })
}

/**
 * Apply placeholders in an editable template.
 * Always ensures the intake URL appears in the final message.
 */
export function resolveResidentIntakeShareMessage(
  template: string,
  params: { projectName: string; intakeUrl: string }
): string {
  const name = params.projectName.trim() || 'הבניין'
  const url = params.intakeUrl.trim()
  let text = (template || '')
    .replaceAll('{project}', name)
    .replaceAll('{url}', url)
    .trim()

  if (!text) {
    return buildResidentIntakeShareMessage({ projectName: name, intakeUrl: url })
  }
  if (url && !text.includes(url)) {
    text = `${text}\n${url}`
  }
  return text
}

export function intakeShareTemplateStorageKey(clientId: string, projectCode: string): string {
  return `bamakor:intake-share-template:${clientId}:${projectCode.trim().toUpperCase()}`
}

/** Opens WhatsApp with prefilled text so the manager can pick a group/chat. */
export function buildResidentIntakeWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message.trim())}`
}
