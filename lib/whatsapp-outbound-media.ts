import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getLogger } from '@/lib/logging'
import { isOutboundLiveAllowed } from '@/lib/outbound-mode'
import { sendRawWhatsAppPayloadWithCredentials } from '@/lib/whatsapp-send'

const logger = getLogger()
const META_UPLOAD_TIMEOUT_MS = 45_000

export type WhatsAppOutboundMediaKind = 'image' | 'document'

export type UploadMetaMediaResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: string }

/**
 * Upload binary to Meta WhatsApp media endpoint — returns media id for send.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function uploadWhatsAppMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<UploadMetaMediaResult> {
  if (!isOutboundLiveAllowed()) {
    return { ok: true, mediaId: `mock_media_${Date.now()}` }
  }

  try {
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename.slice(0, 240)
    )
    form.append('type', mimeType)

    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
      META_UPLOAD_TIMEOUT_MS
    )

    if (!response) {
      return { ok: false, error: 'העלאת קובץ ל-Meta נכשלה (timeout)' }
    }

    const data = (await response.json()) as { id?: string; error?: { message?: string } }
    if (!response.ok || !data.id) {
      const msg = data.error?.message || 'העלאת קובץ ל-Meta נכשלה'
      logger.warn('WA_MEDIA', 'Meta media upload failed', { status: response.status, msg })
      return { ok: false, error: msg }
    }

    return { ok: true, mediaId: data.id }
  } catch (e) {
    logger.warn('WA_MEDIA', 'Meta media upload exception', {
      err: e instanceof Error ? e.message : String(e),
    })
    return { ok: false, error: 'העלאת קובץ ל-Meta נכשלה' }
  }
}

export async function sendWhatsAppMediaByIdWithCredentials(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  kind: WhatsAppOutboundMediaKind,
  mediaId: string,
  opts?: { caption?: string; filename?: string }
): Promise<Record<string, unknown> | null> {
  if (kind === 'image') {
    const image: Record<string, string> = { id: mediaId }
    const cap = opts?.caption?.trim()
    if (cap) image.caption = cap.slice(0, 1024)
    return sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, {
      to,
      type: 'image',
      image,
    })
  }

  const document: Record<string, string> = { id: mediaId }
  const cap = opts?.caption?.trim()
  if (cap) document.caption = cap.slice(0, 1024)
  const fn = opts?.filename?.trim()
  if (fn) document.filename = fn.slice(0, 240)

  return sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, {
    to,
    type: 'document',
    document,
  })
}

export function mimeToOutboundKind(mime: string): WhatsAppOutboundMediaKind | null {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'document'
  return null
}

export const WA_INBOX_OUTBOUND_MAX_BYTES = 16 * 1024 * 1024