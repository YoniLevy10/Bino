/** Normalize scraper login fields before israeli-bank-scrapers. */

/** One Zero requires full E.164 starting with + (e.g. +972541234567). */
export function normalizeOneZeroPhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  let s = String(raw).trim().replace(/[\s\-()]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (s.startsWith('+')) return s
  if (s.startsWith('972')) return `+${s}`
  if (s.startsWith('0') && s.length >= 9) return `+972${s.slice(1)}`
  if (/^5\d{8}$/.test(s)) return `+972${s}`
  return s.startsWith('+') ? s : `+${s}`
}

export function normalizeScraperCredentials(
  provider: string,
  credentials: Record<string, string>
): Record<string, string> {
  const out = { ...credentials }
  if (provider === 'oneZero' && out.phoneNumber) {
    const n = normalizeOneZeroPhone(out.phoneNumber)
    if (n) out.phoneNumber = n
  }
  return out
}
