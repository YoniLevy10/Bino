import { normalizePhone } from '@/lib/residents-whatsapp'

/** Auto-created WhatsApp placeholder — show phone number instead in inbox. */
export function isDisplayableResidentName(fullName: string | null | undefined): boolean {
  const trimmed = (fullName ?? '').trim()
  return trimmed.length > 0 && trimmed !== 'דייר WhatsApp'
}

export type InboxResidentSummary = {
  id: string
  full_name: string
  apartment_number?: string | null
  normalized_phone: string
}

export function formatWhatsAppInboxDisplayLabel(
  phone: string,
  resident?: { full_name?: string | null; apartment_number?: string | null } | null
): string {
  if (resident?.full_name && isDisplayableResidentName(resident.full_name)) {
    const apt = resident.apartment_number?.trim()
    return apt ? `${resident.full_name} · דירה ${apt}` : resident.full_name
  }
  return phone
}

export function pickInboxResidentByPhone(
  residents: InboxResidentSummary[],
  phone: string
): InboxResidentSummary | null {
  const normalized = normalizePhone(phone)
  const matches = residents.filter((r) => r.normalized_phone === normalized)
  return matches.find((r) => isDisplayableResidentName(r.full_name)) ?? null
}

export function residentSummaryFromJoin(
  joined:
    | { full_name?: string; apartment_number?: string | null }
    | { full_name?: string; apartment_number?: string | null }[]
    | null
    | undefined
): { full_name?: string; apartment_number?: string | null } | null {
  if (!joined) return null
  return Array.isArray(joined) ? joined[0] ?? null : joined
}

export function hasDisplayableResidentJoin(
  joined:
    | { full_name?: string; apartment_number?: string | null }
    | { full_name?: string; apartment_number?: string | null }[]
    | null
    | undefined
): boolean {
  const r = residentSummaryFromJoin(joined)
  return isDisplayableResidentName(r?.full_name)
}
