/**
 * Public social profile URLs for Organization sameAs (Wave 3).
 * Set only live profiles — empty env values are ignored.
 */
export function getMarketingSocialSameAs(): string[] {
  const keys = [
    'NEXT_PUBLIC_SOCIAL_LINKEDIN',
    'NEXT_PUBLIC_SOCIAL_FACEBOOK',
    'NEXT_PUBLIC_SOCIAL_INSTAGRAM',
  ] as const
  const out: string[] = []
  for (const key of keys) {
    const raw = (process.env[key] || '').trim()
    if (!raw) continue
    if (!/^https?:\/\//i.test(raw)) continue
    out.push(raw.replace(/\/$/, ''))
  }
  return out
}
