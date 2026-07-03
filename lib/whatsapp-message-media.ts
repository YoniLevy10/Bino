/** Media metadata stored on whatsapp_messages.interactive_payload for inbound image/video. */

export type WhatsAppMessageMediaRef = {
  mediaId: string
  kind: 'image' | 'video'
}

export function buildWhatsAppMessageMediaPayload(
  mediaId: string,
  kind: 'image' | 'video' | 'audio' | 'document' | undefined
): Record<string, string> {
  const resolvedKind = kind === 'video' ? 'video' : 'image'
  return {
    whatsapp_media_id: mediaId,
    whatsapp_media_kind: resolvedKind,
  }
}

export function parseWhatsAppMessageMediaPayload(
  payload: Record<string, unknown> | null | undefined
): WhatsAppMessageMediaRef | null {
  if (!payload || typeof payload !== 'object') return null
  const mediaId = payload.whatsapp_media_id
  if (typeof mediaId !== 'string' || !mediaId.trim()) return null
  const kindRaw = payload.whatsapp_media_kind
  const kind = kindRaw === 'video' ? 'video' : 'image'
  return { mediaId: mediaId.trim(), kind }
}

export function mergeWhatsAppInteractivePayload(
  base: Record<string, unknown> | null | undefined,
  mediaId?: string | null,
  mediaKind?: 'image' | 'video' | 'audio' | 'document' | null
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = { ...(base ?? {}) }
  if (mediaId?.trim() && (mediaKind === 'image' || mediaKind === 'video')) {
    Object.assign(merged, buildWhatsAppMessageMediaPayload(mediaId, mediaKind))
  }
  if (Object.keys(merged).length === 0) return null
  return merged
}
