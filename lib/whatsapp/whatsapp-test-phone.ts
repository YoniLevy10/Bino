import { createHash } from 'crypto'

/** Optional built-in test numbers; prefer WHATSAPP_TEST_PHONE_NUMBERS in env (no hardcoded numbers). */
const BUILTIN_TEST_DIGITS = new Set<string>()

export function normalizeWhatsAppPhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

function envTestDigits(): Set<string> {
  const raw = process.env.WHATSAPP_TEST_PHONE_NUMBERS?.trim()
  const set = new Set<string>(BUILTIN_TEST_DIGITS)
  if (!raw) return set
  for (const part of raw.split(/[,;\s]+/)) {
    const d = normalizeWhatsAppPhoneDigits(part.trim())
    if (d) set.add(d)
  }
  return set
}

export function isWhatsAppTestSender(rawFrom: string): boolean {
  const digits = normalizeWhatsAppPhoneDigits(rawFrom)
  return digits.length > 0 && envTestDigits().has(digits)
}

/**
 * Key stored in sessions / tickets / pending_selections. Real WhatsApp JID stays only in memory for replies.
 */
export function whatsappDbPhoneKey(rawFrom: string): string {
  if (!isWhatsAppTestSender(rawFrom)) return rawFrom
  const digits = normalizeWhatsAppPhoneDigits(rawFrom)
  const salt = process.env.WHATSAPP_TEST_PHONE_HASH_SALT || 'bamakor-test'
  const h = createHash('sha256').update(salt).update('|').update(digits).digest('hex').slice(0, 24)
  return `wa_test_${h}`
}

export function displayReporterForExternalMessage(rawFrom: string): string {
  return isWhatsAppTestSender(rawFrom) ? '(מספר בדיקות)' : rawFrom
}
