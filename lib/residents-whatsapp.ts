import type { SupabaseClient } from '@supabase/supabase-js'
import { displayReporterForExternalMessage } from '@/lib/whatsapp-test-phone'

/** Auto-created stub before manager approval — not a listed resident. */
export const WHATSAPP_PLACEHOLDER_RESIDENT_NAME = 'דייר WhatsApp'

export function isWhatsAppPlaceholderResident(
  resident: { full_name?: string | null } | null | undefined
): boolean {
  const trimmed = (resident?.full_name ?? '').trim()
  return !trimmed || trimmed === WHATSAPP_PLACEHOLDER_RESIDENT_NAME
}

export type ResidentRow = {
  id: string
  project_id: string
  phone: string | null
  normalized_phone?: string | null
  client_id: string | null
  full_name: string
  apartment_number?: string | null
}

/** Prefix for `resident_prompt` — "שלום יוני, " or "שלום, " when name unknown. */
export function residentPromptGreetingPrefix(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed || trimmed === 'דייר WhatsApp') return 'שלום, '
  const first = trimmed.split(/\s+/)[0] ?? trimmed
  return `שלום ${first}, `
}

/** Manager/worker notifications — resident name when known, else phone (or test label). */
export function reporterDisplayNameForNotification(
  phone: string,
  fullName: string | null | undefined
): string {
  const trimmed = (fullName ?? '').trim()
  if (trimmed && trimmed !== 'דייר WhatsApp') return trimmed
  return displayReporterForExternalMessage(phone)
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.startsWith('972')) {
    return digits
  }

  if (digits.startsWith('0')) {
    return `972${digits.slice(1)}`
  }

  return digits
}

export async function findResidentByPhoneClient(
  supabase: SupabaseClient,
  clientId: string,
  dbPhone: string,
  projectId?: string
): Promise<ResidentRow | null> {
  const normalized = normalizePhone(dbPhone)

  let query = supabase
    .from('residents')
    .select('id, project_id, phone, normalized_phone, client_id, full_name, apartment_number')
    .eq('client_id', clientId)
    .eq('normalized_phone', normalized)
    .is('deleted_at', null)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) return null
  return data as ResidentRow
}

/** Listed resident with a real name — excludes WhatsApp auto-stubs. */
export async function findApprovedResidentByPhoneClient(
  supabase: SupabaseClient,
  clientId: string,
  dbPhone: string,
  projectId?: string
): Promise<ResidentRow | null> {
  const row = await findResidentByPhoneClient(supabase, clientId, dbPhone, projectId)
  if (!row || isWhatsAppPlaceholderResident(row)) return null
  return row
}

export async function getOrCreateResident(
  supabase: SupabaseClient,
  clientId: string,
  dbPhone: string,
  projectId: string
): Promise<ResidentRow | null> {
  const normalized = normalizePhone(dbPhone)

  const existing = await findResidentByPhoneClient(
    supabase,
    clientId,
    dbPhone,
    projectId
  )

  if (existing) {
    return existing
  }

  const { data: created, error } = await supabase
    .from('residents')
    .insert({
      client_id: clientId,
      project_id: projectId,
      phone: dbPhone,
      normalized_phone: normalized,
      full_name: WHATSAPP_PLACEHOLDER_RESIDENT_NAME,
    })
    .select('id, project_id, phone, normalized_phone, client_id, full_name, apartment_number')
    .single()

  if (error || !created) {
    console.error('⚠️ getOrCreateResident insert failed:', error)
    return null
  }

  return created as ResidentRow
}
