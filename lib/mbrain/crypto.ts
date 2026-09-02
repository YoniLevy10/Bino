/**
 * Encrypt Meta tokens at rest. Never log plaintext tokens.
 * Key: MBRAIN_TOKEN_ENCRYPTION_KEY — 32-byte hex (64 chars) or base64.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.MBRAIN_TOKEN_ENCRYPTION_KEY
  if (!raw) {
    // Dev fallback — NOT for production live spend
    return createHash('sha256').update('mbrain-dev-insecure-key').digest()
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  const b64 = Buffer.from(raw, 'base64')
  if (b64.length === 32) return b64
  return createHash('sha256').update(raw).digest()
}

/** Returns `iv:tag:ciphertext` base64 parts joined by `.` */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    // Legacy/plaintext (pre-encryption) — only for mock migration path
    if (!blob.includes('.')) return blob
    throw new Error('Invalid encrypted token format')
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.MBRAIN_TOKEN_ENCRYPTION_KEY)
}
