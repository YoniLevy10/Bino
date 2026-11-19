import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * אימות X-Hub-Signature-256 מול גוף ה-Webhook הגולמי (לפי Meta).
 */
export function verifyWhatsAppWebhookSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false

  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const expected = `sha256=${expectedHex}`

  const got = header.trim()

  try {
    if (got.length !== expected.length) return false
    const a = Buffer.from(got, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
