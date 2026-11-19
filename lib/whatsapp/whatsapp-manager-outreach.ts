/**
 * Manager-initiated WhatsApp outreach (inbox compose outside 24h window).
 * Uses Meta UTILITY template `manager_reply` (or WHATSAPP_META_TEMPLATE_MANAGER_REPLY)
 * with the manager's compose text as body {{2}} and optional QUICK_REPLY «קיבלתי».
 */

/** Button title on the approved Meta template (max 25 chars). */
export const MANAGER_OUTREACH_ACK_BUTTON_TEXT = 'קיבלתי'

/** Friendly inbox body when the recipient taps the ack button. */
export const MANAGER_OUTREACH_ACK_DISPLAY_BODY = 'קיבלתי (אישור קריאה)'

/**
 * Detect Meta quick-reply / button payload for the manager-outreach ack.
 * Template QUICK_REPLY buttons often send the button text as id and/or title.
 */
export function isManagerOutreachAckReply(
  replyId?: string | null,
  replyTitle?: string | null
): boolean {
  const id = (replyId ?? '').trim()
  const title = (replyTitle ?? '').trim()
  const needle = MANAGER_OUTREACH_ACK_BUTTON_TEXT

  if (title === needle || id === needle) return true
  // Defensive: Meta sometimes prefixes / suffixes payload ids.
  if (id === 'mgr_ack' || id.endsWith('_mgr_ack') || id.startsWith('mgr_ack')) return true
  if (title.includes(needle) && title.length <= 40) return true
  return false
}

/** Normalize inbound display body for ack taps (session engagement only). */
export function managerOutreachAckInboundBody(
  replyId?: string | null,
  replyTitle?: string | null
): string | null {
  if (!isManagerOutreachAckReply(replyId, replyTitle)) return null
  return MANAGER_OUTREACH_ACK_DISPLAY_BODY
}
