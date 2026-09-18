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

/** Local IL display / paste form: 05xxxxxxxx from 9725… */
export function formatPhoneLocalIl(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw)
  if (!n) return null
  if (n.startsWith('972')) return `0${n.slice(3)}`
  return n
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

/**
 * Deep-link into a WhatsApp chat with phone + optional prefilled text.
 *
 * Use encodeURIComponent (spaces as %20). URLSearchParams uses "+" for spaces,
 * and WhatsApp often opens the chat without the draft text when "+" is used.
 *
 * Prefer api.whatsapp.com/send?phone= — more reliable than wa.me on iOS/PWA
 * where window.open(wa.me/…) often opens WhatsApp without the contact.
 */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const n = normalizePhone(phone)
  if (!n) return null
  if (text?.trim()) {
    return `https://api.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(text.trim())}`
  }
  return `https://api.whatsapp.com/send?phone=${n}`
}

/**
 * Open WhatsApp via a real <a> click (mobile-safe).
 * Avoid target=_blank on touch — same-tab handoff keeps phone+text on iOS.
 */
export function openWhatsAppUrl(href: string): boolean {
  if (typeof document === 'undefined' || !href) return false
  const a = document.createElement('a')
  a.href = href
  const touch =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  if (!touch) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  a.setAttribute('aria-hidden', 'true')
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
}
