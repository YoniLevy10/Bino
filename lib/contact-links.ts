/** Normalize Israeli phone to E.164-ish dial string for tel:/wa.me links. */
export function normalizePhoneDial(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length >= 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length >= 9) return `+972${digits.slice(1)}`
  if (digits.length >= 9) return `+${digits}`
  return null
}

export function telHref(phone: string | null | undefined): string | null {
  const n = normalizePhoneDial(phone)
  return n ? `tel:${n}` : null
}

export function whatsAppHref(phone: string | null | undefined, text?: string): string | null {
  if (!phone?.trim()) return null
  const digits = phone.replace(/\D/g, '')
  let wa = digits
  if (digits.startsWith('0')) wa = `972${digits.slice(1)}`
  else if (!digits.startsWith('972')) wa = digits
  const base = `https://wa.me/${wa}`
  if (text?.trim()) return `${base}?text=${encodeURIComponent(text.trim())}`
  return base
}

export function wazeHref(address: string | null | undefined): string | null {
  if (!address?.trim()) return null
  return `https://waze.com/ul?q=${encodeURIComponent(address.trim())}&navigate=yes`
}

export function googleMapsHref(address: string | null | undefined): string | null {
  if (!address?.trim()) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}
