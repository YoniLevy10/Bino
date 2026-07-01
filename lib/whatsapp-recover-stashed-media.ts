import type { SupabaseClient } from '@supabase/supabase-js'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

type WaMediaKind = 'image' | 'video'

async function attachMediaIdToTicket(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  mediaId: string,
  mediaKind: WaMediaKind,
  accessToken: string,
  attachmentType: string
): Promise<boolean> {
  const mediaData = await downloadWhatsAppMedia(mediaId, mediaKind, accessToken)
  if (!mediaData) return false

  const uploadResult = await uploadWhatsAppMediaToStorage(
    ticketId,
    mediaData.buffer,
    mediaData.fileName,
    mediaData.mimeType
  )
  if (!uploadResult) return false

  return createAttachmentRecord(
    supabaseAdmin,
    ticketId,
    mediaData.fileName,
    uploadResult.filePath,
    uploadResult.fileSize,
    mediaData.mimeType,
    mediaId,
    attachmentType
  )
}

/**
 * Attach pending_whatsapp_media_id from the most recent session (active or not)
 * for this phone + tenant. Used to recover media that was stashed instead of
 * linked to an open ticket.
 */
export async function recoverStashedWhatsAppMediaToTicket(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhone: string,
  accessToken?: string
): Promise<{ recovered: boolean; reason?: string }> {
  if (!accessToken?.trim()) {
    return { recovered: false, reason: 'MISSING_ACCESS_TOKEN' }
  }

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('id, pending_whatsapp_media_id, pending_whatsapp_media_type')
    .eq('phone_number', reporterPhone)
    .eq('client_id', clientId)
    .not('pending_whatsapp_media_id', 'is', null)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('WA_RECOVER', 'session lookup failed', { err: error.message, ticketId })
    return { recovered: false, reason: 'SESSION_LOOKUP_FAILED' }
  }

  const pendingId = (session as { pending_whatsapp_media_id?: string | null } | null)?.pending_whatsapp_media_id
  const pendingTypeRaw = (session as { pending_whatsapp_media_type?: string | null } | null)?.pending_whatsapp_media_type
  const sessionId = (session as { id?: string } | null)?.id

  if (!pendingId || !sessionId) {
    return { recovered: false, reason: 'NO_STASHED_MEDIA' }
  }

  const mediaKind: WaMediaKind = pendingTypeRaw === 'video' ? 'video' : 'image'
  const attachmentType = mediaKind === 'video' ? 'whatsapp_video' : 'whatsapp_image'

  const ok = await attachMediaIdToTicket(
    supabaseAdmin,
    ticketId,
    pendingId,
    mediaKind,
    accessToken,
    attachmentType
  )

  if (!ok) {
    return { recovered: false, reason: 'ATTACH_FAILED' }
  }

  await supabaseAdmin
    .from('sessions')
    .update({
      pending_whatsapp_media_id: null,
      pending_whatsapp_media_type: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  logger.info('WA_RECOVER', 'stashed media recovered to ticket', { ticketId, mediaKind })
  return { recovered: true }
}
