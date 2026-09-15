/** Normalize Israeli phone numbers to digits starting with 972 (no +). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00')) digits = digits.slice(2)

  if (digits.startsWith('0') && digits.length >= 9) {
    digits = `972${digits.slice(1)}`
  } else if (digits.startsWith('972')) {
    // already international
  } else if (digits.length === 9 && digits.startsWith('5')) {
    digits = `972${digits}`
  }

  if (digits.length < 10 || digits.length > 15) return null
  return digits
}

export type PhoneKind = 'mobile' | 'landline' | 'unknown' | 'none'

export function classifyPhoneKind(raw: string | null | undefined): PhoneKind {
  if (!raw?.trim()) return 'none'
  const n = normalizePhone(raw)
  if (!n) return 'unknown'
  if (/^9725\d{8}$/.test(n)) return 'mobile'
  if (/^972[2-4,8-9]\d{7,8}$/.test(n)) return 'landline'
  if (/^9727\d{8}$/.test(n)) return 'landline'
  return 'unknown'
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const n = normalizePhone(phone)
  if (!n) return null
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${n}${q}`
}
