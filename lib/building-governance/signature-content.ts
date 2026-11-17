import { createHash } from 'crypto'

/** SHA-256 hex of signature canvas data-URL (audit / integrity, not encryption). */
export function hashSignatureContent(signatureDataUrl: string): string {
  return createHash('sha256').update(signatureDataUrl, 'utf8').digest('hex')
}
