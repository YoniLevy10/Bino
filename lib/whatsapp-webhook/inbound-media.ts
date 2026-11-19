import { SupabaseClient } from '@supabase/supabase-js'
import { findOpenTicketForPhone } from '@/lib/whatsapp-webhook/flow-ticket'
import { stashPreSessionMedia } from '@/lib/whatsapp-webhook/building-search-stash'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp/whatsapp-media'
import { getLogger } from '@/lib/shared/logging'
import { logCriticalOperationalFailure } from '@/lib/errors/error-logs-db'
import { findApprovedResidentByPhoneClient } from '@/lib/residents/residents-whatsapp'
import { recoverAllWhatsAppMediaForTicket } from '@/lib/whatsapp/whatsapp-recover-stashed-media'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp/whatsapp-template-keys'
import type { ResidentLang } from '@/lib/whatsapp/whatsapp-bilingual-template'
import { resetSessionCompletely } from '@/lib/whatsapp-webhook/inbound-session'

const logger = getLogger()

export type WaInboundMediaKind = 'image' | 'video'

const WA_INBOUND_MEDIA: Record<
  WaInboundMediaKind,
  {
    downloadType: WaInboundMediaKind
    attachmentType: string
    templates: {
      attached: WhatsAppTemplateKey
      failed: WhatsAppTemplateKey
      stashed: WhatsAppTemplateKey
    }
  }
> = {
  image: {
    downloadType: 'image',
    attachmentType: 'whatsapp_image',
    templates: {
      attached: 'image_attached',
      failed: 'image_failed',
      stashed: 'image_stashed',
    },
  },
  video: {
    downloadType: 'video',
    attachmentType: 'whatsapp_video',
    templates: {
      attached: 'video_attached',
      failed: 'video_failed',
      stashed: 'video_stashed',
    },
  },
}

export type WaSendFn = (
  to: string,
  templateKey: WhatsAppTemplateKey,
  creds?: { phoneNumberId?: string; accessToken?: string },
  vars?: Partial<
    Record<'project_name' | 'ticket_number' | 'description' | 'reporter_name' | 'building_line' | 'list', string>
  >,
  lang?: ResidentLang
) => Promise<unknown>

const MEDIA_ATTACH_RETRY_MS = 1200

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function logWebhookOperationalError(
  context: string,
  message: string,
  clientId?: string,
  details?: Record<string, unknown>,
  clientName?: string | null
): Promise<void> {
  const isMedia = context.startsWith('media_')
  const alertKind = context === 'ticket_create'
    ? 'ticket_create_failure'
    : isMedia
      ? 'media_attach_failure'
      : 'operational_error'
  const alertTitle = context === 'ticket_create'
    ? 'כשל יצירת תקלה מ-WhatsApp'
    : isMedia
      ? 'כשל צירוף מדיה לתקלה'
      : 'שגיאה ב-webhook WhatsApp'

  void logCriticalOperationalFailure({
    context: `whatsapp_webhook:${context}`,
    message,
    clientId: clientId ?? null,
    clientName: clientName ?? null,
    details: { ...details, source: 'dispatch-inbound' },
    alertKind,
    alertTitle,
  })
}

async function attachWhatsAppMediaToTicketOnce(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  mediaId: string,
  mediaKind: WaInboundMediaKind,
  accessToken?: string,
  clientId?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!accessToken?.trim()) {
    const reason = 'MISSING_ACCESS_TOKEN'
    logger.warn('WEBHOOK', 'media attach skipped — no tenant access token', { ticketId, mediaId, mediaKind })
    return { ok: false, reason }
  }

  const config = WA_INBOUND_MEDIA[mediaKind]
  const mediaData = await downloadWhatsAppMedia(mediaId, config.downloadType, accessToken)
  if (!mediaData) {
    return { ok: false, reason: 'DOWNLOAD_FAILED' }
  }

  const uploadResult = await uploadWhatsAppMediaToStorage(
    ticketId,
    mediaData.buffer,
    mediaData.fileName,
    mediaData.mimeType
  )
  if (!uploadResult) {
    return { ok: false, reason: 'STORAGE_UPLOAD_FAILED' }
  }

  const attachmentCreated = await createAttachmentRecord(
    supabaseAdmin,
    ticketId,
    mediaData.fileName,
    uploadResult.filePath,
    uploadResult.fileSize,
    mediaData.mimeType,
    mediaId,
    config.attachmentType
  )
  if (!attachmentCreated) {
    return { ok: false, reason: 'DB_INSERT_FAILED' }
  }

  return { ok: true }
}

const MEDIA_ATTACH_FAILURE_MESSAGES: Record<string, string> = {
  MISSING_ACCESS_TOKEN: 'Missing WhatsApp access token for media download',
  DOWNLOAD_FAILED: 'WhatsApp media download failed after retries',
  STORAGE_UPLOAD_FAILED: 'ticket-attachments storage upload failed',
  DB_INSERT_FAILED: 'ticket_attachments insert failed',
}

/** Download + upload + DB insert; retries the full pipeline once on transient failures. */
async function attachWhatsAppMediaToTicket(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  mediaId: string,
  mediaKind: WaInboundMediaKind,
  accessToken?: string,
  clientId?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const first = await attachWhatsAppMediaToTicketOnce(
    supabaseAdmin,
    ticketId,
    mediaId,
    mediaKind,
    accessToken,
    clientId
  )
  if (first.ok) return first

  if (first.reason === 'MISSING_ACCESS_TOKEN') {
    void logWebhookOperationalError(
      'media_attach',
      MEDIA_ATTACH_FAILURE_MESSAGES.MISSING_ACCESS_TOKEN,
      clientId,
      { ticketId, mediaId, mediaKind, reason: first.reason }
    )
    return first
  }

  await sleepMs(MEDIA_ATTACH_RETRY_MS)
  const second = await attachWhatsAppMediaToTicketOnce(
    supabaseAdmin,
    ticketId,
    mediaId,
    mediaKind,
    accessToken,
    clientId
  )
  if (second.ok) return second

  const reason = second.reason
  const contextKey =
    reason === 'DOWNLOAD_FAILED'
      ? 'media_download'
      : reason === 'STORAGE_UPLOAD_FAILED'
        ? 'media_upload'
        : reason === 'DB_INSERT_FAILED'
          ? 'media_db'
          : 'media_attach'
  void logWebhookOperationalError(
    contextKey,
    MEDIA_ATTACH_FAILURE_MESSAGES[reason] || `Media attach failed: ${reason}`,
    clientId,
    { ticketId, mediaId, mediaKind, reason, retried: true }
  )
  return second
}

export async function handleWhatsAppInboundMedia(
  from: string,
  webhookClientId: string,
  supabaseAdmin: SupabaseClient,
  mediaId: string,
  mediaKind: WaInboundMediaKind,
  waRecipient: string,
  sendWa: WaSendFn,
  residentWhatsAppCreds: { phoneNumberId?: string; accessToken?: string },
  isTestWhatsAppSender: boolean,
  caption?: string,
  onPreSessionMediaStashed?: () => Promise<void>
): Promise<void> {
  const config = WA_INBOUND_MEDIA[mediaKind]
  const label = mediaKind === 'video' ? 'video' : 'image'
  const accessToken = residentWhatsAppCreds.accessToken

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('id, phone_number, project_id, active_ticket_id, is_active')
    .eq('phone_number', from)
    .eq('client_id', webhookClientId)
    .eq('is_active', true)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionError) {
    logger.warn('WEBHOOK', `fetch session for ${label} attachment failed`, { err: sessionError.message })
  }

  if (session?.active_ticket_id) {
    const ticketId = session.active_ticket_id
    const result = await attachWhatsAppMediaToTicket(
      supabaseAdmin,
      ticketId,
      mediaId,
      mediaKind,
      accessToken,
      webhookClientId
    )

    if (result.ok) {
      logger.info('WEBHOOK', `${label} attached to ticket`, { ticketId })
      try {
        await sendWa(waRecipient, config.templates.attached, residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      await resetSessionCompletely(from, supabaseAdmin, webhookClientId, `${label}_processed_success`)
      return
    }

    logger.warn('WEBHOOK', `${label} attach failed, sending fallback`, {
      ticketId,
      failureReason: result.reason,
    })
    try {
      await sendWa(waRecipient, config.templates.failed, residentWhatsAppCreds)
    } catch { /* WA send failure is non-fatal */ }
    await resetSessionCompletely(from, supabaseAdmin, webhookClientId, `${label}_processed_failure`)
    return
  }

  const openTicket = await findOpenTicketForPhone(from, supabaseAdmin, webhookClientId)
  if (openTicket) {
    const ticketId = openTicket.id

    await recoverAllWhatsAppMediaForTicket(
      supabaseAdmin,
      webhookClientId,
      ticketId,
      from,
      accessToken
    )

    const result = await attachWhatsAppMediaToTicket(
      supabaseAdmin,
      ticketId,
      mediaId,
      mediaKind,
      accessToken,
      webhookClientId
    )

    if (result.ok) {
      logger.info('WEBHOOK', `${label} attached to open ticket`, { ticketId })
      try {
        await sendWa(waRecipient, config.templates.attached, residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      await resetSessionCompletely(from, supabaseAdmin, webhookClientId, `open_ticket_${label}_processed_success`)
      return
    }

    logger.warn('WEBHOOK', `open-ticket ${label} attach failed`, { ticketId, failureReason: result.reason })
    try {
      await sendWa(waRecipient, config.templates.failed, residentWhatsAppCreds)
    } catch { /* WA send failure is non-fatal */ }
    await resetSessionCompletely(from, supabaseAdmin, webhookClientId, `open_ticket_${label}_processed_failure`)
    return
  }

  if (session?.project_id && !session.active_ticket_id && session.id) {
    const stashPayload: Record<string, string | null> = {
      pending_whatsapp_media_id: mediaId,
      pending_whatsapp_media_type: mediaKind,
      last_activity_at: new Date().toISOString(),
    }
    let { error: stashErr } = await supabaseAdmin
      .from('sessions')
      .update(stashPayload)
      .eq('id', session.id)

    if (stashErr) {
      const msg = String((stashErr as { message?: string }).message || '')
      if (msg.includes('pending_whatsapp_media_type') || (stashErr as { code?: string }).code === '42703') {
        const fallback = await supabaseAdmin
          .from('sessions')
          .update({
            pending_whatsapp_media_id: mediaId,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)
        stashErr = fallback.error
      }
    }

    if (stashErr) {
      logger.warn('WEBHOOK', `stash pending ${label} failed`, { err: stashErr.message })
      try {
        await sendWa(waRecipient, config.templates.failed, residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
    } else {
      try {
        await sendWa(waRecipient, config.templates.stashed, residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
    }
    return
  }

  if (!isTestWhatsAppSender) {
    const knownResident = await findApprovedResidentByPhoneClient(supabaseAdmin, webhookClientId, from)
    if (knownResident?.project_id) {
      const lateOpenTicket = await findOpenTicketForPhone(from, supabaseAdmin, webhookClientId)
      if (lateOpenTicket) {
        const result = await attachWhatsAppMediaToTicket(
          supabaseAdmin,
          lateOpenTicket.id,
          mediaId,
          mediaKind,
          accessToken,
          webhookClientId
        )
        if (result.ok) {
          try {
            await sendWa(waRecipient, config.templates.attached, residentWhatsAppCreds)
          } catch { /* WA send failure is non-fatal */ }
          await resetSessionCompletely(from, supabaseAdmin, webhookClientId, `known_resident_open_ticket_${label}`)
          return
        }
      }

      await supabaseAdmin
        .from('sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .eq('phone_number', from)
        .eq('client_id', webhookClientId)
        .eq('is_active', true)

      const { error: sessionInsertError } = await supabaseAdmin.from('sessions').insert({
        phone_number: from,
        client_id: webhookClientId,
        project_id: knownResident.project_id,
        is_active: true,
        active_ticket_id: null,
        pending_whatsapp_media_id: mediaId,
        pending_whatsapp_media_type: mediaKind,
        last_activity_at: new Date().toISOString(),
      })

      if (!sessionInsertError) {
        try {
          await sendWa(waRecipient, config.templates.stashed, residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      logger.warn('WEBHOOK', `known-resident media session insert failed`, {
        err: sessionInsertError.message,
      })
    }
  }

  try {
    await stashPreSessionMedia(from, mediaId, mediaKind, supabaseAdmin, webhookClientId)
    if (caption?.trim()) return
    if (onPreSessionMediaStashed) {
      await onPreSessionMediaStashed()
    }
  } catch { /* WA send failure is non-fatal */ }
}
/** If the user sent media before the first text in this session, attach it to the new ticket. */
export async function attachPendingWhatsAppMediaToTicketIfAny(
  from: string,
  clientId: string,
  ticketId: string,
  supabaseAdmin: SupabaseClient,
  accessToken?: string
): Promise<boolean> {
  const { data: openSession, error } = await supabaseAdmin
    .from('sessions')
    .select('id, pending_whatsapp_media_id, pending_whatsapp_media_type')
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string }).message || '')
    if (
      msg.includes('pending_whatsapp_media_id') ||
      msg.includes('pending_whatsapp_media_type') ||
      (error as { code?: string }).code === '42703'
    ) {
      return false
    }
    logger.warn('WEBHOOK', 'pending media: could not load session', { err: (error as { message?: string }).message })
    return false
  }

  const pendingId = (openSession as { pending_whatsapp_media_id?: string | null } | null)
    ?.pending_whatsapp_media_id
  const pendingTypeRaw = (openSession as { pending_whatsapp_media_type?: string | null } | null)
    ?.pending_whatsapp_media_type
  const mediaKind: WaInboundMediaKind = pendingTypeRaw === 'video' ? 'video' : 'image'
  const sessionId = (openSession as { id?: string } | null)?.id
  if (!pendingId || !sessionId) return false

  const clearPayload: Record<string, string | null> = {
    pending_whatsapp_media_id: null,
    pending_whatsapp_media_type: null,
    last_activity_at: new Date().toISOString(),
  }
  const { error: clearPendingErr } = await supabaseAdmin
    .from('sessions')
    .update(clearPayload)
    .eq('id', sessionId)

  if (clearPendingErr) {
    const m = String((clearPendingErr as { message?: string }).message || '')
    if (
      m.includes('pending_whatsapp_media_id') ||
      m.includes('pending_whatsapp_media_type') ||
      (clearPendingErr as { code?: string }).code === '42703'
    ) {
      await supabaseAdmin
        .from('sessions')
        .update({
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  }

  const result = await attachWhatsAppMediaToTicket(
    supabaseAdmin,
    ticketId,
    pendingId,
    mediaKind,
    accessToken,
    clientId
  )
  if (!result.ok) {
    logger.warn('WEBHOOK', 'pending media attach failed', { pendingId, ticketId, reason: result.reason })
    return false
  }
  return true
}
