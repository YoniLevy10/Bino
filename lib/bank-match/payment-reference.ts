/** Short transfer reference for collection charges (BINO-XXXX). */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePaymentReference(seed?: string): string {
  if (seed && /^BINO-[A-Z0-9]{4,8}$/i.test(seed.trim())) {
    return seed.trim().toUpperCase()
  }
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `BINO-${out}`
}

export function extractPaymentReference(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.toUpperCase().match(/\bBINO-[A-Z0-9]{4,8}\b/)
  return m ? m[0] : null
}
