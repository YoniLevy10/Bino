import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function keyBytes(): Buffer {
  const secret =
    process.env.BUILDING_BANK_SCRAPER_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  if (!secret) {
    throw new Error('חסר מפתח הצפנה לפרטי בנק (BUILDING_BANK_SCRAPER_SECRET)')
  }
  return createHash('sha256').update(secret).digest()
}

/** Encrypt JSON credentials at-rest. Format: v1.<iv_b64>.<tag_b64>.<cipher_b64> */
export function encryptScraperCredentials(payload: Record<string, string>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

export function decryptScraperCredentials(
  blob: string | null | undefined
): Record<string, string> | null {
  if (!blob || !blob.startsWith('v1.')) return null
  const parts = blob.split('.')
  if (parts.length !== 4) return null
  const iv = Buffer.from(parts[1], 'base64url')
  const tag = Buffer.from(parts[2], 'base64url')
  const data = Buffer.from(parts[3], 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(plain) as unknown
  if (!parsed || typeof parsed !== 'object') return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return out
}
