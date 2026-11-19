import { createHash } from 'node:crypto'
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp/whatsapp-parser'

/**
 * Meta usually sends a stable message id; when it is missing, duplicate deliveries can double-process
 * the same user text (e.g. two tickets / welcome + "couldn't identify"). Bucket by a few seconds so
 * legitimate repeats later still work.
 */
export function webhookDedupeMessageId(parsed: ParsedWhatsAppMessage): string {
  if (parsed.messageId && parsed.messageId.length > 0) return parsed.messageId
  const bucket = Math.floor(Date.now() / 5000)
  const mediaPart = parsed.mediaId || ''
  const h = createHash('sha256')
    .update(`${parsed.from}|${parsed.messageType}|${parsed.textBody}|${mediaPart}|${bucket}`)
    .digest('hex')
    .slice(0, 48)
  return `wm:${h}`
}
