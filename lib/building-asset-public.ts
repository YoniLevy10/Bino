import { getClientPublicOrigin } from '@/lib/shared/public-origin'

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** URL-safe slug for asset QR stickers (no ambiguous 0/O/1/l). */
export function generateBuildingAssetPublicSlug(bytes?: Uint8Array): string {
  const buf = bytes && bytes.length >= 10 ? bytes : crypto.getRandomValues(new Uint8Array(10))
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += SLUG_ALPHABET[buf[i % buf.length]! % SLUG_ALPHABET.length]!
  }
  return out
}

export function buildingAssetPublicPath(slug: string): string {
  return `/asset/${encodeURIComponent(slug.trim())}`
}

export function buildingAssetPublicUrl(slug: string, baseUrl?: string): string {
  const base = ((baseUrl || '').trim() || getClientPublicOrigin()).replace(/\/$/, '')
  return `${base}${buildingAssetPublicPath(slug)}`
}

export function isValidBuildingAssetSlug(raw: string): boolean {
  return /^[a-z0-9]{8,32}$/.test((raw || '').trim())
}
