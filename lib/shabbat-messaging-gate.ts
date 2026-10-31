const ISRAEL_TZ = 'Asia/Jerusalem'

/**
 * Product Shabbat window for outbound SMS/WhatsApp:
 * full Saturday (יום שבת) in Asia/Jerusalem calendar day — not astronomical
 * Friday-sunset→Saturday-sunset. Matches prior sla-check / weekly-digest behavior.
 */
export const SHABBAT_MESSAGING_BLOCK_REASON =
  'שליחת הודעות מושבתת בשבת (שעון ישראל)'

/** Saturday (יום שבת) in Israel — no outbound SMS/WhatsApp. */
export function isIsraelShabbat(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, weekday: 'short' }).format(
    now
  )
  return weekday === 'Sat'
}

export function shabbatMessagingBlockReason(now: Date = new Date()): string | null {
  if (!isIsraelShabbat(now)) return null
  return SHABBAT_MESSAGING_BLOCK_REASON
}

export function isOutboundMessagingBlocked(now: Date = new Date()): boolean {
  return isIsraelShabbat(now)
}

/** Detect Shabbat skip text in error_logs / Meta bag / ops alert payloads. */
export function isShabbatMessagingSkipMessage(message?: string | null): boolean {
  const msg = message?.trim()
  if (!msg) return false
  return msg.includes(SHABBAT_MESSAGING_BLOCK_REASON) || msg.includes('מושבתת בשבת')
}
