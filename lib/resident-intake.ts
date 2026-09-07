/**
 * Per-project resident intake survey — shareable link for WhatsApp building groups.
 * Max ~5 questions; creates/updates a row in `residents`.
 */

import { isWhatsAppPlaceholderResident } from '@/lib/residents-whatsapp'

export type ResidentIntakeLinkParams = {
  projectCode: string
  clientId: string
  /** Prefer NEXT_PUBLIC_APP_URL; fall back to window origin in the browser. */
  baseUrl?: string
}

/** Fields the public intake form may contribute onto an existing resident card. */
export type ResidentIntakeIncomingFields = {
  full_name: string
  phone: string
  normalized_phone: string
  email: string | null
  apartment_number: string
  is_renter: boolean
}

export type ResidentIntakeExistingFields = {
  full_name: string | null
  phone: string | null
  normalized_phone: string | null
  email: string | null
  apartment_number: string | null
  is_renter: boolean | null
  project_id: string
  deleted_at?: string | null
}

function nonempty(value: string | null | undefined): string | null {
  const t = (value || '').trim()
  return t || null
}

/**
 * Fill-only merge: keep existing card values when present; add missing/extra
 * details from intake. Never blank out an existing email/apartment/name.
 */
export function mergeResidentIntakeFields(
  existing: ResidentIntakeExistingFields,
  incoming: ResidentIntakeIncomingFields,
  targetProjectId: string
): {
  patch: {
    full_name: string
    phone: string
    normalized_phone: string
    email: string | null
    apartment_number: string | null
    is_renter: boolean
    project_id: string
    deleted_at: null | undefined
  }
  changed: boolean
} {
  const existingName = nonempty(existing.full_name)
  const incomingName = nonempty(incoming.full_name) || ''
  const keepExistingName =
    !!existingName && !isWhatsAppPlaceholderResident({ full_name: existingName })
  const full_name = keepExistingName ? existingName! : incomingName || existingName || ''

  const email = nonempty(existing.email) || nonempty(incoming.email)
  const apartment_number =
    nonempty(existing.apartment_number) || nonempty(incoming.apartment_number)

  const phone = nonempty(existing.phone) || nonempty(incoming.phone) || incoming.phone
  const normalized_phone =
    nonempty(existing.normalized_phone) ||
    nonempty(incoming.normalized_phone) ||
    incoming.normalized_phone

  const is_renter = Boolean(existing.is_renter) || Boolean(incoming.is_renter)

  // Soft-deleted or WhatsApp placeholder cards move into the intake building.
  // Real cards in another building stay put — still no duplicate row.
  const revive = !!existing.deleted_at
  const placeholder = isWhatsAppPlaceholderResident({ full_name: existing.full_name })
  const project_id =
    revive || placeholder || existing.project_id === targetProjectId
      ? targetProjectId
      : existing.project_id

  const patch = {
    full_name,
    phone,
    normalized_phone,
    email,
    apartment_number,
    is_renter,
    project_id,
    deleted_at: revive ? (null as null) : undefined,
  }

  const changed =
    patch.full_name !== (existing.full_name || '') ||
    patch.phone !== (existing.phone || '') ||
    patch.normalized_phone !== (existing.normalized_phone || '') ||
    (patch.email || null) !== (existing.email || null) ||
    (patch.apartment_number || null) !== (existing.apartment_number || null) ||
    patch.is_renter !== Boolean(existing.is_renter) ||
    patch.project_id !== existing.project_id ||
    revive

  return { patch, changed }
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
