/** WhatsApp Inbox OPC-style v2 (filters, media, FAB, forward). */

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off'])

function isTruthyEnvValue(v: string | undefined): boolean {
  if (!v) return false
  return TRUTHY.has(v.trim().toLowerCase())
}

function isFalsyEnvValue(v: string | undefined): boolean {
  if (!v) return false
  return FALSY.has(v.trim().toLowerCase())
}

/**
 * Server + build-time flag (prefer WHATSAPP_INBOX_V2; public mirror for client UI).
 * Default ON when unset — v2 shipped; set exact `false` to roll back.
 * Dynamic `process.env[name]` is OK on the server.
 */
export function isWhatsAppInboxV2Enabled(): boolean {
  const server = process.env.WHATSAPP_INBOX_V2
  const pub = process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2
  if (isFalsyEnvValue(server) || isFalsyEnvValue(pub)) return false
  if (isTruthyEnvValue(server) || isTruthyEnvValue(pub)) return true
  return true
}

/**
 * Client components — Next only inlines *static* `process.env.NEXT_PUBLIC_*` access.
 * Do not use `process.env[name]` here or the flag always reads as off in the browser.
 * Default ON when the public env is unset (matches server default).
 */
export function isWhatsAppInboxV2ClientEnabled(): boolean {
  const pub = process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2
  if (isFalsyEnvValue(pub)) return false
  if (isTruthyEnvValue(pub)) return true
  return true
}
