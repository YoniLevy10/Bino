import { WHATSAPP_PLACEHOLDER_RESIDENT_NAME } from '@/lib/residents-whatsapp'

/** WhatsApp display name, safe to show as a save suggestion. Never a legal name. */
export function sanitizeWhatsAppProfileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  if (cleaned === WHATSAPP_PLACEHOLDER_RESIDENT_NAME) return null
  if (!/\p{L}/u.test(cleaned)) return null
  return cleaned
}
