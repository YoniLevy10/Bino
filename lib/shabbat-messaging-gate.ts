const ISRAEL_TZ = 'Asia/Jerusalem'

/** Saturday (יום שבת) in Israel — no outbound SMS/WhatsApp. */
export function isIsraelShabbat(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, weekday: 'short' }).format(now)
  return weekday === 'Sat'
}

export function shabbatMessagingBlockReason(now: Date = new Date()): string | null {
  if (!isIsraelShabbat(now)) return null
  return 'שליחת הודעות מושבתת בשבת (שעון ישראל)'
}

export function isOutboundMessagingBlocked(now: Date = new Date()): boolean {
  return isIsraelShabbat(now)
}
