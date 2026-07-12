import type { SupabaseClient } from '@supabase/supabase-js'

export const TICKET_ATTACHMENT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export const TICKET_ATTACHMENT_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

export const TICKET_ATTACHMENT_WEB_MIME_TYPES = [
  ...TICKET_ATTACHMENT_IMAGE_MIME_TYPES,
  ...TICKET_ATTACHMENT_VIDEO_MIME_TYPES,
  'application/pdf',
] as const

export const TICKET_ATTACHMENT_WORKER_MIME_TYPES = [...TICKET_ATTACHMENT_IMAGE_MIME_TYPES] as const

export const TICKET_ATTACHMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const TICKET_ATTACHMENT_MAX_VIDEO_BYTES = 15 * 1024 * 1024
export const TICKET_ATTACHMENT_MAX_WORKER_BYTES = TICKET_ATTACHMENT_MAX_IMAGE_BYTES

export type TicketAttachmentUploadContext = 'web' | 'worker'

export type TicketAttachmentValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function maxBytesForTicketAttachment(
  mimeType: string,
  context: TicketAttachmentUploadContext
): number {
  if (context === 'worker') return TICKET_ATTACHMENT_MAX_WORKER_BYTES
  if ((TICKET_ATTACHMENT_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return TICKET_ATTACHMENT_MAX_VIDEO_BYTES
  }
  return TICKET_ATTACHMENT_MAX_IMAGE_BYTES
}

export function allowedMimeTypesForTicketAttachment(
  context: TicketAttachmentUploadContext
): readonly string[] {
  return context === 'worker'
    ? TICKET_ATTACHMENT_WORKER_MIME_TYPES
    : TICKET_ATTACHMENT_WEB_MIME_TYPES
}

export function validateTicketAttachmentFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  context: TicketAttachmentUploadContext
): TicketAttachmentValidationResult {
  const allowed = allowedMimeTypesForTicketAttachment(context)
  if (!allowed.includes(file.type)) {
    return { ok: false, error: `סוג קובץ לא נתמך: ${file.type || file.name}` }
  }

  const maxBytes = maxBytesForTicketAttachment(file.type, context)
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    return { ok: false, error: `קובץ "${file.name}" גדול מ-${maxMb}MB` }
  }

  return { ok: true }
}

function attachmentTypeForMime(mimeType: string, context: TicketAttachmentUploadContext): string {
  if (context === 'worker') return 'worker_completion'
  if ((TICKET_ATTACHMENT_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'web_upload_video'
  }
  if (mimeType === 'application/pdf') return 'web_upload_pdf'
  return 'web_upload'
}

function buildStoragePath(ticketId: string, fileName: string): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(7)
  const extension = fileName.split('.').pop() || 'bin'
  return `${ticketId}/${timestamp}-${randomStr}.${extension}`
}

export type UploadTicketAttachmentsResult = {
  success: number
  failed: number
  warning?: string
}

/** Upload files to ticket-attachments bucket and insert ticket_attachments rows. */
export async function uploadTicketAttachments(
  admin: SupabaseClient,
  ticketId: string,
  files: File[],
  context: TicketAttachmentUploadContext
): Promise<UploadTicketAttachmentsResult> {
  let successCount = 0
  let failCount = 0

  for (const file of files) {
    const validation = validateTicketAttachmentFile(file, context)
    if (!validation.ok) {
      console.error(`❌ Attachment validation failed for ${file.name}:`, validation.error)
      failCount++
      continue
    }

    const filePath = buildStoragePath(ticketId, file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const { error: uploadError } = await admin.storage
        .from('ticket-attachments')
        .upload(filePath, new Uint8Array(arrayBuffer), {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        console.error(`❌ Failed to upload file ${file.name} to storage:`, {
          error: uploadError,
          filePath,
          ticketId,
          fileSize: file.size,
          mimeType: file.type,
        })
        failCount++
        continue
      }

      const { error: dbError } = await admin
        .from('ticket_attachments')
        .insert({
          ticket_id: ticketId,
          file_name: file.name,
          file_url: filePath,
          mime_type: file.type,
          attachment_type: attachmentTypeForMime(file.type, context),
        })

      if (dbError) {
        console.error(`❌ Failed to create attachment record for ${file.name}:`, {
          error: dbError.message,
          code: dbError.code,
          details: dbError.details,
          ticketId,
          filePath,
        })
        await admin.storage.from('ticket-attachments').remove([filePath])
        failCount++
        continue
      }

      successCount++
    } catch (err) {
      console.error(`❌ Unexpected error uploading ${file.name}:`, err)
      failCount++
    }
  }

  const label = context === 'worker' ? 'קובץ/ים' : 'קובץ/ים'
  const warning =
    failCount > 0
      ? `⚠️ ${failCount} מתוך ${files.length} ${label} לא הועלו. התקלה נשמרה בהצלחה.`
      : undefined

  return { success: successCount, failed: failCount, warning }
}

/** Upload a single worker attachment and return the DB row. */
export async function uploadSingleWorkerTicketAttachment(
  admin: SupabaseClient,
  ticketId: string,
  file: File
): Promise<
  | {
      ok: true
      row: {
        id: string
        file_name: string
        file_url: string
        mime_type: string
        attachment_type: string
        created_at: string
      }
    }
  | { ok: false; error: string }
> {
  const validation = validateTicketAttachmentFile(file, 'worker')
  if (!validation.ok) return { ok: false, error: validation.error }

  const filePath = buildStoragePath(ticketId, file.name)
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('ticket-attachments')
    .upload(filePath, new Uint8Array(arrayBuffer), { contentType: file.type, upsert: false })

  if (uploadError) return { ok: false, error: 'העלאה נכשלה' }

  const { data: row, error: dbError } = await admin
    .from('ticket_attachments')
    .insert({
      ticket_id: ticketId,
      file_name: file.name,
      file_url: filePath,
      mime_type: file.type,
      attachment_type: 'worker_completion',
    })
    .select('id, file_name, file_url, mime_type, attachment_type, created_at')
    .single()

  if (dbError || !row) {
    await admin.storage.from('ticket-attachments').remove([filePath])
    return { ok: false, error: 'שמירה נכשלה' }
  }

  return { ok: true, row }
}
