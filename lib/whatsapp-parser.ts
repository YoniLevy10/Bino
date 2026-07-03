export type ParsedWhatsAppMessage = {
  from: string
  messageType: string
  textBody: string
  messageId?: string
  mediaId?: string
  mediaType?: 'image' | 'audio' | 'video' | 'document'
  location?: { lat: number; lng: number; name?: string; address?: string }
  /** Meta interactive list/button reply id */
  interactiveReplyId?: string
  interactiveReplyTitle?: string
  /** Present when Meta sends type=unsupported (e.g. 131060 placeholder before real media). */
  unsupportedErrorCode?: number
}

/**
 * Heuristic: does this message look like a building / address lookup (not a greeting)?
 * Supports both Hebrew and English addresses.
 */
export function isAddressLikeText(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false

  // Any digit → likely a street number or building number
  if (/\d/.test(t)) return true

  // Hebrew address cues
  const hebrewAddressCues = [
    'רחוב', 'רח׳', 'כתובת',
    'בניין', 'בנין', 'בניי',
    'דירה', 'קומה', 'כניסה',
    'שדרה', 'שד׳', 'מגרש',
    'יישוב', 'שכונה',
    'פינת', 'מספר',
  ]
  if (hebrewAddressCues.some((cue) => t.includes(cue))) return true

  // English address cues (case-insensitive)
  const tLower = t.toLowerCase()
  const englishAddressCues = [
    'street', ' st ', 'avenue', ' ave', 'blvd', 'boulevard',
    'road', ' rd ', 'lane', 'drive', ' dr ', 'court', 'place',
    'building', 'floor', 'apt ', 'apartment', 'unit ', 'entrance',
  ]
  if (englishAddressCues.some((cue) => tLower.includes(cue))) return true

  // Short Hebrew-only token (e.g. building nickname)
  if (/^[֐-׿]{3,40}$/.test(t)) return true

  // Short Latin-only token — could be an English building/street name
  if (/^[A-Za-z]{3,30}$/.test(t)) return true

  const words = t.split(/\s+/).filter(Boolean)

  // Two Hebrew words — street name without number (e.g. "הרצל כהן")
  const hebrewWord = /[֐-׿]{2,}/
  if (
    words.length === 2 &&
    t.length >= 12 &&
    words.every((w) => hebrewWord.test(w) || /^[\s,.-]+$/.test(w))
  ) {
    return true
  }

  // Two Latin words — English street name (e.g. "Ben Gurion")
  const latinWord = /^[A-Za-z]{2,}$/
  if (words.length === 2 && words.every((w) => latinWord.test(w))) return true

  return false
}

/** Meta Cloud API: receiving phone number ID (identifies which Bamakor tenant / WhatsApp line). */
export function extractWhatsAppPhoneNumberId(body: unknown): string | null {
  const bodyRecord = body as Record<string, unknown>
  const entry = (bodyRecord.entry as unknown[])?.[0] as Record<string, unknown>
  const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
  const value = change?.value as Record<string, unknown>
  const metadata = value?.metadata as Record<string, unknown>
  const id = metadata?.phone_number_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function parseIncomingWhatsAppMessage(body: unknown): ParsedWhatsAppMessage | null {
  const bodyRecord = body as Record<string, unknown>
  const entry = (bodyRecord.entry as unknown[])?.[0] as Record<string, unknown>
  const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
  const value = change?.value as Record<string, unknown>
  const message = (value?.messages as unknown[])?.[0] as Record<string, unknown>

  if (!message) return null

  const mid = message?.id
  const result: ParsedWhatsAppMessage = {
    from: String(message?.from || ''),
    messageType: String(message?.type || ''),
    textBody: String((message?.text as Record<string, unknown>)?.body || '').trim(),
    messageId: typeof mid === 'string' && mid.length > 0 ? mid : undefined,
  }

  if (message?.type === 'unsupported') {
    const errors = message?.errors as unknown[] | undefined
    const first = errors?.[0] as { code?: number } | undefined
    if (typeof first?.code === 'number') {
      result.unsupportedErrorCode = first.code
    }
  }

  if (message?.type === 'image' && (message?.image as Record<string, unknown>)?.id) {
    const image = message.image as Record<string, unknown>
    result.mediaId = String(image.id)
    result.mediaType = 'image'
    const caption = typeof image.caption === 'string' ? image.caption.trim() : ''
    if (caption) result.textBody = caption
  } else if (message?.type === 'audio' && (message?.audio as Record<string, unknown>)?.id) {
    result.mediaId = String((message.audio as Record<string, unknown>).id)
    result.mediaType = 'audio'
  } else if (message?.type === 'video' && (message?.video as Record<string, unknown>)?.id) {
    const video = message.video as Record<string, unknown>
    result.mediaId = String(video.id)
    result.mediaType = 'video'
    const caption = typeof video.caption === 'string' ? video.caption.trim() : ''
    if (caption) result.textBody = caption
  } else if (message?.type === 'document' && (message?.document as Record<string, unknown>)?.id) {
    result.mediaId = String((message.document as Record<string, unknown>).id)
    result.mediaType = 'document'
  }

  if (message?.type === 'location') {
    const loc = message?.location as Record<string, unknown> | undefined
    const lat = loc?.latitude != null ? Number(loc.latitude) : Number.NaN
    const lng = loc?.longitude != null ? Number(loc.longitude) : Number.NaN
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result.location = {
        lat,
        lng,
        name: typeof loc?.name === 'string' ? loc.name : undefined,
        address: typeof loc?.address === 'string' ? loc.address : undefined,
      }
    }
  }

  if (message?.type === 'interactive') {
    const interactive = message?.interactive as Record<string, unknown> | undefined
    const interactiveType = String(interactive?.type || '')
    if (interactiveType === 'button_reply') {
      const br = interactive?.button_reply as Record<string, unknown> | undefined
      result.interactiveReplyId = typeof br?.id === 'string' ? br.id : undefined
      result.interactiveReplyTitle = typeof br?.title === 'string' ? br.title : undefined
      result.textBody = result.interactiveReplyTitle || result.interactiveReplyId || ''
    } else if (interactiveType === 'list_reply') {
      const lr = interactive?.list_reply as Record<string, unknown> | undefined
      result.interactiveReplyId = typeof lr?.id === 'string' ? lr.id : undefined
      result.interactiveReplyTitle = typeof lr?.title === 'string' ? lr.title : undefined
      result.textBody = result.interactiveReplyTitle || result.interactiveReplyId || ''
    }
  }

  return result
}
