/** Client-only read receipts for inbox v2 (no DB column). */

const KEY_PREFIX = 'wa_inbox_read_v1:'

export function inboxReadStorageKey(conversationId: string): string {
  return `${KEY_PREFIX}${conversationId}`
}

export function getConversationLastReadAt(conversationId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(inboxReadStorageKey(conversationId))
  } catch {
    return null
  }
}

export function markConversationRead(conversationId: string, atIso = new Date().toISOString()): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(inboxReadStorageKey(conversationId), atIso)
  } catch {
    /* ignore quota */
  }
}

export function conversationHasUnread(
  conversationId: string,
  lastInboundAt: string | null | undefined
): boolean {
  if (!lastInboundAt) return false
  const readAt = getConversationLastReadAt(conversationId)
  if (!readAt) return true
  return new Date(lastInboundAt).getTime() > new Date(readAt).getTime()
}

/** Serialize read map for list API unread filter (bounded). */
export function buildInboxReadMapForRequest(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(KEY_PREFIX)) continue
      const conversationId = key.slice(KEY_PREFIX.length)
      const val = window.localStorage.getItem(key)
      if (conversationId && val) out[conversationId] = val
      if (Object.keys(out).length >= 200) break
    }
  } catch {
    return {}
  }
  return out
}