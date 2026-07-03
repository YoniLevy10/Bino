import { parseWhatsAppMessageMediaPayload } from '@/lib/whatsapp-message-media'

export type WhatsAppThreadMessage = {
  direction: string
  message_type?: string | null
  interactive_payload?: Record<string, unknown> | null
}

export type TicketAttachmentSummary = {
  mime_type?: string | null
  attachment_type?: string | null
  whatsapp_media_id?: string | null
}

export function threadHasInboundMediaMessages(messages: WhatsAppThreadMessage[]): boolean {
  return messages.some(
    (m) =>
      m.direction === 'in' &&
      (m.message_type === 'image' || m.message_type === 'video')
  )
}

export function ticketHasVideoAttachment(attachments: TicketAttachmentSummary[]): boolean {
  return attachments.some(
    (a) =>
      a.mime_type?.startsWith('video/') ||
      a.attachment_type === 'whatsapp_video'
  )
}

export function ticketHasImageAttachment(attachments: TicketAttachmentSummary[]): boolean {
  return attachments.some(
    (a) =>
      a.mime_type?.startsWith('image/') ||
      a.attachment_type === 'whatsapp_image'
  )
}

/** True when the WhatsApp thread shows media the ticket is still missing. */
export function threadHasUnrecoveredMedia(
  messages: WhatsAppThreadMessage[],
  attachments: TicketAttachmentSummary[]
): boolean {
  const inboundMedia = messages.filter(
    (m) =>
      m.direction === 'in' &&
      (m.message_type === 'image' || m.message_type === 'video')
  )
  if (inboundMedia.length === 0) return false

  const attachedIds = new Set(
    attachments
      .map((a) => a.whatsapp_media_id?.trim())
      .filter((id): id is string => !!id)
  )

  const hasVideoMsg = inboundMedia.some((m) => m.message_type === 'video')
  const hasImageMsg = inboundMedia.some((m) => m.message_type === 'image')

  if (hasVideoMsg && !ticketHasVideoAttachment(attachments)) return true
  if (hasImageMsg && !ticketHasImageAttachment(attachments)) return true

  for (const msg of inboundMedia) {
    const ref = parseWhatsAppMessageMediaPayload(msg.interactive_payload ?? null)
    if (ref && !attachedIds.has(ref.mediaId)) return true
  }

  return false
}

export function unrecoveredMediaLabel(messages: WhatsAppThreadMessage[]): string {
  const hasVideo = messages.some((m) => m.direction === 'in' && m.message_type === 'video')
  const hasImage = messages.some((m) => m.direction === 'in' && m.message_type === 'image')
  if (hasVideo && hasImage) return 'תמונה/וידאו'
  if (hasVideo) return 'וידאו'
  return 'תמונה'
}
