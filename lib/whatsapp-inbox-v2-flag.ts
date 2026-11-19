/** WhatsApp Inbox OPC-style v2 (filters, media, FAB, forward). */

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

function isTruthyEnvValue(v: string | undefined): boolean {
  if (!v) return false
  return TRUTHY.has(v.trim().toLowerCase())
}

/**
 * Server + build-time flag (prefer WHATSAPP_INBOX_V2; public mirror for client UI).
 * Dynamic `process.env[name]` is OK on the server.
 */
export function isWhatsAppInboxV2Enabled(): boolean {
  return (
    isTruthyEnvValue(process.env.WHATSAPP_INBOX_V2) ||
    isTruthyEnvValue(process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2)
  )
}

/**
 * Client components — Next only inlines *static* `process.env.NEXT_PUBLIC_*` access.
 * Do not use `process.env[name]` here or the flag always reads as off in the browser.
 */
export function isWhatsAppInboxV2ClientEnabled(): boolean {
  return isTruthyEnvValue(process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2)
}
