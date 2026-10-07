import { formatPhoneLocalIl } from '@/lib/sales-leads/phone'

/** Auto-created stub before manager approval — not a listed resident name. */
export const WHATSAPP_PLACEHOLDER_RESIDENT_NAME = 'דייר WhatsApp'

/** Real saved name, or null for empty / WhatsApp placeholder stubs. */
export function savedResidentDisplayName(fullName: string | null | undefined): string | null {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed || trimmed === WHATSAPP_PLACEHOLDER_RESIDENT_NAME) return null
  return trimmed
}

/** Israeli local form when possible; test-hash keys stay labeled. */
export function formatReporterPhoneForDisplay(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('wa_test_')) return '(מספר בדיקות)'
  return formatPhoneLocalIl(raw) || raw
}

/**
 * Saved resident: "שם 05xxxxxxxx".
 * Unknown person: the phone alone.
 */
export function formatReporterNameAndPhone(
  fullName: string | null | undefined,
  phone: string | null | undefined
): string {
  const name = savedResidentDisplayName(fullName)
  const phoneLabel = formatReporterPhoneForDisplay(phone)
  if (name && phoneLabel) return `${name} ${phoneLabel}`
  if (name) return name
  return phoneLabel
}

/** Digits key matching `residents.normalized_phone` / `normalizePhone` in residents-whatsapp. */
export function normalizeReporterPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return `972${digits.slice(1)}`
  return digits
}
