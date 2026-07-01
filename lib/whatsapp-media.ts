import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getLogger } from '@/lib/logging'

const mediaLogger = getLogger()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getServiceSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service credentials')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

async function cleanupOrphanedStorageFile(filePath: string) {
  try {
    const supabase = getServiceSupabase()

    const { error } = await supabase.storage
      .from('ticket-attachments')
      .remove([filePath])

    if (error) {
      console.error('⚠️ ORPHAN_CLEANUP_FAILED', {
        filePath,
        error: error.message,
      })
      return false
    }

    console.log('🧹 ORPHAN_CLEANUP_SUCCESS', { filePath })
    return true
  } catch (err) {
    console.error('⚠️ ORPHAN_CLEANUP_UNEXPECTED_FAILURE', {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Download media from WhatsApp/Meta using the media ID
 */
const MEDIA_DOWNLOAD_RETRY_MS = 1200

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function downloadWhatsAppMediaOnce(
  mediaId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  token: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  let mediaUrlResponse
  try {
    mediaUrlResponse = await fetchWithTimeout(
      `https://graph.facebook.com/v23.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    if (!mediaUrlResponse) {
      mediaLogger.warn('WA_MEDIA', 'Meta media URL request timed out', { mediaId, mediaType })
      return null
    }
  } catch (fetchErr) {
    mediaLogger.warn('WA_MEDIA', 'Meta media URL request failed', {
      mediaId,
      mediaType,
      err: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    })
    return null
  }

  if (!mediaUrlResponse.ok) {
    const errBody = await mediaUrlResponse.text().catch(() => '')
    mediaLogger.warn('WA_MEDIA', 'Meta media URL request not ok', {
      mediaId,
      mediaType,
      status: mediaUrlResponse.status,
      body: errBody.slice(0, 300),
    })
    return null
  }

  const mediaData = await mediaUrlResponse.json()
  const mediaUrl = mediaData?.url

  if (!mediaUrl) {
    mediaLogger.warn('WA_MEDIA', 'Meta media URL missing in response', { mediaId, mediaType })
    return null
  }

  let fileResponse
  try {
    fileResponse = await fetchWithTimeout(mediaUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!fileResponse) {
      mediaLogger.warn('WA_MEDIA', 'Media binary download timed out', { mediaId, mediaType })
      return null
    }
  } catch (fetchErr) {
    mediaLogger.warn('WA_MEDIA', 'Media binary download failed', {
      mediaId,
      mediaType,
      err: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    })
    return null
  }

  if (!fileResponse.ok) {
    mediaLogger.warn('WA_MEDIA', 'Media binary download not ok', {
      mediaId,
      mediaType,
      status: fileResponse.status,
    })
    return null
  }

  const arrayBuffer = await fileResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const contentType = fileResponse.headers.get('content-type') || getMimeType(mediaType)
  const fileName = `whatsapp_${mediaType}_${Date.now()}.${getExtension(mediaType)}`

  return {
    buffer,
    mimeType: contentType,
    fileName,
  }
}

/**
 * Download media from WhatsApp/Meta using the media ID.
 * Retries once after a short delay (Meta URLs can be briefly unavailable).
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  /** Per-tenant token from clients.whatsapp_access_token — required for multi-tenant media download. */
  accessToken?: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  try {
    const token = (accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '').trim()

    if (!token) {
      mediaLogger.error(
        'WA_MEDIA',
        'Missing WhatsApp access token for media download',
        new Error('missing_whatsapp_access_token'),
        { mediaId, mediaType, hasTenantToken: Boolean(accessToken?.trim()) }
      )
      return null
    }

    const first = await downloadWhatsAppMediaOnce(mediaId, mediaType, token)
    if (first) return first

    await sleepMs(MEDIA_DOWNLOAD_RETRY_MS)
    return downloadWhatsAppMediaOnce(mediaId, mediaType, token)
  } catch (err) {
    mediaLogger.warn('WA_MEDIA', 'Unexpected media download error', {
      mediaId,
      mediaType,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function uploadWhatsAppMediaToStorage(
  ticketId: string,
  mediaBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ filePath: string; fileSize: number } | null> {
  try {
    const supabase = getServiceSupabase()

    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const extension = fileName.split('.').pop() || 'dat'
    const filePath = `${ticketId}/${timestamp}-${randomStr}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('ticket-attachments')
      .upload(filePath, mediaBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('❌ UPLOAD_FAILURE', {
        ticketId,
        filePath,
        error: uploadError.message,
      })
      return null
    }

    return {
      filePath,
      fileSize: mediaBuffer.length,
    }
  } catch {
    return null
  }
}

export async function createAttachmentRecord(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  fileName: string,
  filePath: string,
  fileSize: number,
  mimeType: string,
  mediaId?: string,
  attachmentType: string = 'whatsapp_image'
): Promise<boolean> {
  try {
    const payload = {
      ticket_id: ticketId,
      file_name: fileName,
      file_url: filePath,
      mime_type: mimeType,
      attachment_type: attachmentType,
      whatsapp_media_id: mediaId || null,
    }

    const { error: dbError } = await supabaseAdmin
      .from('ticket_attachments')
      .insert(payload)

    if (dbError) {
      console.error('❌ DB_INSERT_FAILURE', {
        ticketId,
        filePath,
        error: dbError.message,
      })

      await cleanupOrphanedStorageFile(filePath)

      return false
    }

    return true
  } catch {
    await cleanupOrphanedStorageFile(filePath)
    return false
  }
}

function getMimeType(mediaType: 'image' | 'audio' | 'video' | 'document'): string {
  const mimeTypes: Record<string, string> = {
    image: 'image/jpeg',
    audio: 'audio/mpeg',
    video: 'video/mp4',
    document: 'application/octet-stream',
  }
  return mimeTypes[mediaType] || 'application/octet-stream'
}

function getExtension(mediaType: 'image' | 'audio' | 'video' | 'document'): string {
  const extensions: Record<string, string> = {
    image: 'jpg',
    audio: 'mp3',
    video: 'mp4',
    document: 'bin',
  }
  return extensions[mediaType] || 'bin'
}
