import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

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
export async function downloadWhatsAppMedia(
  mediaId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document'
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

    if (!accessToken) {
      console.error('❌ DOWNLOAD_FAILURE: Missing WHATSAPP_ACCESS_TOKEN environment variable')
      return null
    }

    let mediaUrlResponse
    try {
      mediaUrlResponse = await fetchWithTimeout(
        `https://graph.facebook.com/v23.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      if (!mediaUrlResponse) return null
    } catch (fetchErr) {
      console.error('❌ DOWNLOAD_FAILURE: Network error during Meta API media URL request', {
        mediaId,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      })
      return null
    }

    if (!mediaUrlResponse.ok) {
      return null
    }

    const mediaData = await mediaUrlResponse.json()
    const mediaUrl = mediaData?.url

    if (!mediaUrl) {
      return null
    }

    let fileResponse
    try {
      fileResponse = await fetchWithTimeout(mediaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!fileResponse) return null
    } catch {
      return null
    }

    if (!fileResponse.ok) {
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
  } catch {
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
