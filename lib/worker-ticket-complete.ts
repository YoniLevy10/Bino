import type { SupabaseClient } from '@supabase/supabase-js'

import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'
import { notifyReporterIfTicketNewlyClosed } from '@/lib/reporter-ticket-closed-notify'
import { getLogger } from '@/lib/logging'
import { sendTicketResidentWhatsAppImage } from '@/lib/whatsapp-ticket-reply'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const COMPLETION_CAPTION = 'התיקון בוצע. תודה על הדיווח.'

export type WorkerTicketCompleteResult = {
  ok: true
  attachment_id: string | null
  completion_image_sent: boolean
  completion_image_error?: string
  reporter_has_phone: boolean
  whatsapp_sent: boolean
  sms_sent: boolean
  whatsapp_error?: string
}

type CompletionAttachmentRow = {
  id: string
  file_url: string | null
  mime_type: string | null
}

async function uploadWorkerCompletionPhoto(
  admin: SupabaseClient,
  ticketId: string,
  file: File
): Promise<{ id: string; file_url: string; mime_type: string } | null> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('קובץ גדול מ-5MB')
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('סוג קובץ לא נתמך')
  }

  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(7)
  const extension = file.name.split('.').pop() || 'jpg'
  const filePath = `${ticketId}/${timestamp}-${randomStr}.${extension}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('ticket-attachments')
    .upload(filePath, new Uint8Array(arrayBuffer), { contentType: file.type, upsert: false })

  if (uploadError) {
    throw new Error('העלאה נכשלה')
  }

  const { data: row, error: dbError } = await admin
    .from('ticket_attachments')
    .insert({
      ticket_id: ticketId,
      file_name: file.name,
      file_url: filePath,
      mime_type: file.type,
      attachment_type: 'worker_completion',
    })
    .select('id, file_url, mime_type')
    .single()

  if (dbError || !row) {
    await admin.storage.from('ticket-attachments').remove([filePath])
    getLogger().error('WORKER_API', 'completion photo attachment insert failed', dbError ?? new Error('no row'))
    throw new Error('שמירה נכשלה')
  }

  return row as { id: string; file_url: string; mime_type: string }
}

async function loadLatestWorkerCompletionAttachment(
  admin: SupabaseClient,
  ticketId: string
): Promise<CompletionAttachmentRow | null> {
  const { data } = await admin
    .from('ticket_attachments')
    .select('id, file_url, mime_type')
    .eq('ticket_id', ticketId)
    .eq('attachment_type', 'worker_completion')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as CompletionAttachmentRow | null) ?? null
}

export async function completeWorkerTicketWithPhoto(
  admin: SupabaseClient,
  opts: {
    clientId: string
    workerId: string
    ticketId: string
    file?: File | null
  }
): Promise<WorkerTicketCompleteResult> {
  const logger = getLogger()

  const { data: existing, error: existingErr } = await admin
    .from('tickets')
    .select('id, status')
    .eq('id', opts.ticketId)
    .eq('client_id', opts.clientId)
    .eq('assigned_worker_id', opts.workerId)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingErr || !existing) {
    throw new Error('תקלה לא נמצאה או שאינה משויכת אליך')
  }

  const previousStatus = (existing as { status?: string }).status
  if (previousStatus === 'CLOSED') {
    throw new Error('התקלה כבר סגורה')
  }

  let attachment: { id: string; file_url: string; mime_type: string } | null = null
  if (opts.file) {
    attachment = await uploadWorkerCompletionPhoto(admin, opts.ticketId, opts.file)
  } else {
    const latest = await loadLatestWorkerCompletionAttachment(admin, opts.ticketId)
    if (latest?.file_url) {
      attachment = {
        id: latest.id,
        file_url: latest.file_url,
        mime_type: latest.mime_type || 'image/jpeg',
      }
    }
  }

  let imageSend: Awaited<ReturnType<typeof sendTicketResidentWhatsAppImage>> = { sent: false }
  if (attachment) {
    const signedUrl = await createServerSignedAttachmentUrl(admin, attachment.file_url)
    if (signedUrl) {
      imageSend = await sendTicketResidentWhatsAppImage(admin, {
        clientId: opts.clientId,
        ticketId: opts.ticketId,
        imageLink: signedUrl,
        caption: COMPLETION_CAPTION,
      })
      if (!imageSend.sent && imageSend.reporterPhone) {
        logger.warn('WORKER_API', 'Completion photo WhatsApp failed', {
          ticket_id: opts.ticketId,
          error: imageSend.errorMessage,
        })
      }
    } else {
      logger.warn('WORKER_API', 'Completion photo signed URL failed', { ticket_id: opts.ticketId })
    }
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await admin
    .from('tickets')
    .update({
      status: 'CLOSED',
      closed_at: now,
      updated_at: now,
    })
    .eq('id', opts.ticketId)
    .eq('client_id', opts.clientId)
    .eq('assigned_worker_id', opts.workerId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .select('id, status')
    .maybeSingle()

  if (updateErr || !updated) {
    throw new Error('סגירת התקלה נכשלה')
  }

  const notify = await notifyReporterIfTicketNewlyClosed(
    admin,
    opts.clientId,
    opts.ticketId,
    previousStatus
  )

  logger.info('WORKER_API', 'Worker completed ticket with photo', {
    ticket_id: opts.ticketId,
    completion_image_sent: imageSend.sent,
    whatsapp_closed_sent: notify?.whatsappSent ?? false,
  })

  return {
    ok: true,
    attachment_id: attachment?.id ?? null,
    completion_image_sent: imageSend.sent,
    completion_image_error: imageSend.sent ? undefined : imageSend.errorMessage,
    reporter_has_phone: imageSend.reporterPhone ? true : notify?.reporterHasPhone ?? false,
    whatsapp_sent: notify?.whatsappSent ?? false,
    sms_sent: notify?.smsSent ?? false,
    whatsapp_error: notify?.whatsappError,
  }
}
