import { SupabaseClient } from '@supabase/supabase-js'
import { isTicketInTreatment } from '@/lib/ticket-status'
import { resolveClientIdByWhatsAppPhoneNumberId } from '@/lib/tenant-resolution'
import {
  parseIncomingWhatsAppMessage,
  isAddressLikeText,
  extractWhatsAppPhoneNumberId,
  type ParsedWhatsAppMessage,
} from '@/lib/whatsapp-parser'
import { webhookDedupeMessageId } from '@/lib/whatsapp-webhook-dedupe'
import {
  isGreetingSmallTalk,
  isStatusQuestion,
  looksLikeTicketDescription,
  resolveTicketPriorityFromResidentMessage,
  statusLabelHe,
  isClarificationQuestion,
  isTicketConfirmText,
} from '@/lib/whatsapp-intent'
import { resolveMessageForLanguage, normalizeResidentLang, type ResidentLang } from '@/lib/whatsapp-bilingual-template'
import {
  getResidentLanguage,
  saveResidentLanguage,
  hasExplicitResidentLanguage,
  preferredLanguageForNewSession,
} from '@/lib/whatsapp-resident-language'
import { RESIDENT_UI_COPY, residentGreetingPrefix } from '@/lib/whatsapp-resident-copy'
import { fetchWithTimeout as fetchTimeout } from '@/lib/fetch-timeout'
import {
  parseStartCode,
  isNumericSelection,
  searchProjectsByBuilding,
  searchProjectsInList,
  createPendingSelection,
  getPendingSelection,
  clearPendingSelection,
  expireInactiveSessions,
  getActiveSession,
  type SessionRow,
} from '@/lib/whatsapp-webhook'
import { findOpenTicketForPhone } from '@/lib/whatsapp-webhook/flow-ticket'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import {
  buildProjectSelectionListPayload,
  buildConfirmTicketButtonsPayload,
  buildLanguageButtonsPayload,
  parseProjectListReplyId,
  parseConfirmButtonReplyId,
  parseLanguageButtonReplyId,
} from '@/lib/whatsapp-interactive'
import {
  persistWhatsAppMessage,
  extractMetaWaMessageId,
} from '@/lib/whatsapp-message-store'
import {
  sendWhatsAppTextMessage,
  sendWhatsAppInteractivePayloadWithCredentials,
} from '@/lib/whatsapp-send'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_EDITOR_DEFAULTS, SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'
import { resolveWhatsAppTemplateMessage, resolveSmsTemplateMessage } from '@/lib/whatsapp-templates'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'
import { autoAssignTicketFromProject } from '@/lib/assign-ticket-worker'
import { notifyAlertWorkersOnNewTicket } from '@/lib/notify-field-workers-new-ticket'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { getLogger } from '@/lib/logging'
import { logCriticalOperationalFailure } from '@/lib/error-logs-db'
import { getPublicTicketsUrl } from '@/lib/public-app-url'
import { isWhatsAppTestSender, whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import { queuePendingResidentApproval } from '@/lib/pending-resident-from-ticket'
import { recoverAllWhatsAppMediaForTicket } from '@/lib/whatsapp-recover-stashed-media'
import { checkAndFlagRecurringIssue } from '@/lib/predictive-alerts'
import {
  findResidentByPhoneClient,
  getOrCreateResident,
  reporterDisplayNameForNotification,
} from '@/lib/residents-whatsapp'

const logger = getLogger()

type WaLocation = NonNullable<ParsedWhatsAppMessage['location']>
type WaInboundMediaKind = 'image' | 'video'

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

type WaSendFn = (
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

async function logWebhookOperationalError(
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

async function handleWhatsAppInboundMedia(
  from: string,
  webhookClientId: string,
  supabaseAdmin: SupabaseClient,
  mediaId: string,
  mediaKind: WaInboundMediaKind,
  waRecipient: string,
  sendWa: WaSendFn,
  residentWhatsAppCreds: { phoneNumberId?: string; accessToken?: string },
  isTestWhatsAppSender: boolean
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
    const knownResident = await findResidentByPhoneClient(supabaseAdmin, webhookClientId, from)
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
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, knownResident.project_id)
        } catch { /* non-fatal */ }
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
    await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
  } catch { /* WA send failure is non-fatal */ }
}

async function resetSessionCompletely(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string,
  reason: string
) {
  const nowIso = new Date().toISOString()
  logger.debug('WEBHOOK', 'session reset', { reason })

  // 1) Clear any pending multi-match selection state (prevents being stuck on "reply 1/2/3")
  await clearPendingSelection(from, supabaseAdmin, clientId)

  // 2) Deactivate all active sessions for this phone (prevents old project/ticket context leaking)
  const { error } = await supabaseAdmin
    .from('sessions')
    .update({
      is_active: false,
      active_ticket_id: null,
      pending_ticket_description: null,
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)

  if (error) {
    logger.warn('WEBHOOK', 'SESSION_RESET_FAILED', { reason, err: error.message })
  }
}

async function getTicketStatus(ticketId: string, supabaseAdmin: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('status')
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'fetch ticket status failed', { ticketId, err: error.message })
    return null
  }

  return (data as { status?: string } | null)?.status || null
}

/** If the user sent media before the first text in this session, attach it to the new ticket. */
async function attachPendingWhatsAppMediaToTicketIfAny(
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

/** Same reporter + tenant, non-closed ticket opened within the last N seconds (duplicate guard). */
async function findOpenTicketForReporterInWindow(
  from: string,
  clientId: string,
  windowSeconds: number,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string; ticket_number: number; description: string | null; status: string } | null> {
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, description, status')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data as { id: string; ticket_number: number; description: string | null; status: string }
}

async function mergeWhatsAppLocationIntoTicketMetadata(
  admin: SupabaseClient,
  ticketId: string,
  loc: WaLocation
) {
  const { data } = await admin
    .from('tickets')
    .select('ticket_metadata')
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()
  const raw = (data as { ticket_metadata?: unknown } | null)?.ticket_metadata
  const prev = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  const next = {
    ...prev,
    whatsapp_location: {
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      address: loc.address,
      received_at: new Date().toISOString(),
    },
  }
  const { error } = await admin
    .from('tickets')
    .update({ ticket_metadata: next })
    .eq('id', ticketId)
    .is('deleted_at', null)
  if (error) {
    logger.warn('WEBHOOK', 'merge location into ticket failed', { ticketId, err: error.message })
  }
}

/** After ticket insert: copy stashed session location into ticket metadata. */
async function attachPendingSessionLocationToTicketIfAny(
  from: string,
  clientId: string,
  ticketId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  const { data: openSession, error } = await supabaseAdmin
    .from('sessions')
    .select('id, pending_location')
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string }).message || '')
    if (msg.includes('pending_location') || (error as { code?: string }).code === '42703') {
      return false
    }
    logger.warn('WEBHOOK', 'pending location: could not load session', { err: (error as { message?: string }).message })
    return false
  }

  const pl = (openSession as { pending_location?: WaLocation | null } | null)?.pending_location
  const sessionId = (openSession as { id?: string } | null)?.id
  if (!pl || typeof pl.lat !== 'number' || typeof pl.lng !== 'number' || !sessionId) return false

  await mergeWhatsAppLocationIntoTicketMetadata(supabaseAdmin, ticketId, pl)

  const { error: clearErr } = await supabaseAdmin
    .from('sessions')
    .update({ pending_location: null, last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (clearErr) {
    const m = String((clearErr as { message?: string }).message || '')
    if (!m.includes('pending_location') && (clearErr as { code?: string }).code !== '42703') {
      logger.warn('WEBHOOK', 'pending location: clear failed', { err: m })
    }
  }
  return true
}

/** אופציונלי: טננט שנפתר ב-route לפני background — למניעת כפילות DB */
export type WaWebhookTenant = { clientId: string; row: Record<string, unknown> }

export async function runWhatsAppInboundBackground(
  body: unknown,
  requestId: string,
  parsedMessage: ParsedWhatsAppMessage,
  supabaseAdmin: SupabaseClient,
  tenantPreResolved?: WaWebhookTenant
): Promise<void> {
  try {
    let webhookClientId: string
    let waClient: {
      id: string
      name?: string | null
      sms_sender_name?: string | null
      whatsapp_phone_number_id?: string | null
      whatsapp_access_token?: string | null
      manager_phone?: string | null
      default_worker_phone?: string | null
      sms_on_ticket_open?: boolean | null
      sms_on_ticket_close?: boolean | null
    } | null

    if (tenantPreResolved) {
      webhookClientId = tenantPreResolved.clientId
      waClient = tenantPreResolved.row as typeof waClient
    } else {
      const phoneNumberId = extractWhatsAppPhoneNumberId(body)
      if (!phoneNumberId) {
        logger.error('WEBHOOK', 'missing phone_number_id in webhook metadata', new Error('missing_phone_number_id'))
        return
      }

      const waResolved = await resolveClientIdByWhatsAppPhoneNumberId(supabaseAdmin, phoneNumberId)
      if (!waResolved) {
        logger.error(
          'WEBHOOK',
          'No client for WhatsApp phone_number_id',
          new Error('no_client_for_phone_number_id'),
          { requestId, phoneNumberId }
        )
        void logWebhookOperationalError(
          'tenant_resolve',
          `No client for WhatsApp phone_number_id ${phoneNumberId}`,
          undefined,
          { requestId, phoneNumberId }
        )
        return
      }
      webhookClientId = waResolved.clientId
      waClient = waResolved.row as typeof waClient
    }

    const residentWhatsAppCreds = {
      phoneNumberId: (waClient as { whatsapp_phone_number_id?: string | null } | null)
        ?.whatsapp_phone_number_id || undefined,
      accessToken: (waClient as { whatsapp_access_token?: string | null } | null)
        ?.whatsapp_access_token || undefined,
    }

    const clientName = (waClient as { name?: string | null } | null)?.name || 'המערכת'
    const smsSenderName = (waClient as { sms_sender_name?: string | null } | null)?.sms_sender_name || null
    const clientManagerPhone = (waClient as { manager_phone?: string | null } | null)?.manager_phone || null
    const smsOnTicketOpen = (waClient as { sms_on_ticket_open?: boolean | null } | null)?.sms_on_ticket_open !== false

    type WaTemplateVars = Partial<
      Record<'project_name' | 'ticket_number' | 'description' | 'reporter_name' | 'building_line' | 'list', string>
    >

    async function sendWa(
      to: string,
      templateKey: WhatsAppTemplateKey,
      creds?: { phoneNumberId?: string; accessToken?: string },
      vars: WaTemplateVars = {},
      lang: ResidentLang = residentLang
    ) {
      const raw = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        templateKey,
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[templateKey],
        vars
      )
      const msg = resolveMessageForLanguage(raw, lang)
      logger.info('WEBHOOK', 'WA template send', {
        requestId,
        templateKey,
        lang,
        to: isWhatsAppTestSender(to) ? '(test)' : `…${to.slice(-4)}`,
      })
      const result = await sendWhatsAppTextMessage(to, msg, creds, { clientId: webhookClientId })
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: msg,
        messageType: 'text',
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function sendWaInteractiveList(
      to: string,
      projects: ProjectRow[],
      bodyText: string,
      creds?: { phoneNumberId?: string; accessToken?: string },
      lang: ResidentLang = residentLang
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const payload = buildProjectSelectionListPayload(to, projects, bodyText, lang)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function sendWaConfirmButtons(
      to: string,
      bodyText: string,
      creds?: { phoneNumberId?: string; accessToken?: string },
      lang: ResidentLang = residentLang
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const payload = buildConfirmTicketButtonsPayload(to, bodyText, lang)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    async function sendWaLanguageButtons(
      to: string,
      creds?: { phoneNumberId?: string; accessToken?: string }
    ) {
      if (!creds?.phoneNumberId || !creds?.accessToken) return null
      const bodyText = 'שלום! בחרו שפה / Choisissez votre langue / Choose your language:'
      const payload = buildLanguageButtonsPayload(to, bodyText)
      const result = await sendWhatsAppInteractivePayloadWithCredentials(
        creds.phoneNumberId,
        creds.accessToken,
        payload
      )
      void persistWhatsAppMessage(supabaseAdmin, {
        clientId: webhookClientId,
        phone: from,
        direction: 'out',
        body: bodyText,
        messageType: 'interactive',
        interactivePayload: payload.interactive as Record<string, unknown>,
        waMessageId: extractMetaWaMessageId(result),
      })
      return result
    }

    // Expire temporary WhatsApp session state if inactive (scoped to this tenant)
    // Fire-and-forget: don't block the critical message-handling path if Supabase is slow/ETIMEDOUT
    void expireInactiveSessions(supabaseAdmin, webhookClientId)

    const { from: waFrom, messageType, textBody, mediaId, mediaType, location: waLocation, interactiveReplyId } = parsedMessage
    const waRecipient = waFrom
    const from = whatsappDbPhoneKey(waFrom)
    const isTestWhatsAppSender = isWhatsAppTestSender(waFrom)

    let session = await getActiveSession(from, supabaseAdmin, webhookClientId)
    let residentLang: ResidentLang = await getResidentLanguage(
      supabaseAdmin,
      webhookClientId,
      from,
      session
    )

    void persistWhatsAppMessage(supabaseAdmin, {
      clientId: webhookClientId,
      phone: from,
      direction: 'in',
      body:
        textBody ||
        (messageType === 'image' && mediaId ? '📷 תמונה' : null) ||
        (messageType === 'video' && mediaId ? '🎬 וידאו' : null) ||
        (interactiveReplyId ? `[${interactiveReplyId}]` : null),
      messageType: messageType || 'text',
      waMessageId: parsedMessage.messageId ?? null,
      interactivePayload: interactiveReplyId
        ? { reply_id: interactiveReplyId, title: parsedMessage.interactiveReplyTitle }
        : null,
    })

    logger.info('WEBHOOK', 'Parsed incoming message', {
      requestId,
      from: isTestWhatsAppSender ? '(test)' : waRecipient,
      messageType,
      hasText: !!textBody,
      hasMedia: !!mediaId,
    })

    /** Shared WhatsApp location → ticket metadata / session stash */
    async function handleInboundLocation(loc: WaLocation) {
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
        logger.warn('WEBHOOK', 'fetch session for location failed', { err: sessionError.message })
      }

      if (session?.active_ticket_id) {
        await mergeWhatsAppLocationIntoTicketMetadata(supabaseAdmin, session.active_ticket_id, loc)
        try {
          await sendWa(waRecipient, 'location_attached', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        if (session.id) {
          await supabaseAdmin
            .from('sessions')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', session.id)
        }
        return
      }

      const openTicket = await findOpenTicketForPhone(from, supabaseAdmin, webhookClientId)
      if (openTicket) {
        await mergeWhatsAppLocationIntoTicketMetadata(supabaseAdmin, openTicket.id, loc)
        try {
          await sendWa(waRecipient, 'location_attached', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      if (session?.id && session.project_id && !session.active_ticket_id) {
        const payload = {
          lat: loc.lat,
          lng: loc.lng,
          name: loc.name,
          address: loc.address,
          stashed_at: new Date().toISOString(),
        }
        const { error: stashErr } = await supabaseAdmin
          .from('sessions')
          .update({
            pending_location: payload,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)

        if (stashErr) {
          const msg = String((stashErr as { message?: string }).message || '')
          if (!msg.includes('pending_location') && (stashErr as { code?: string }).code !== '42703') {
            logger.warn('WEBHOOK', 'pending_location stash failed', { err: msg })
          }
        }

        try {
          await sendWa(waRecipient, 'location_stashed', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      try {
        await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
    }

    // Meta sends type=unsupported placeholders (often 131060) before the real image/video webhook — ignore silently.
    if (messageType === 'unsupported') {
      logger.info('WEBHOOK', 'Meta unsupported webhook ignored', {
        requestId,
        unsupportedErrorCode: parsedMessage.unsupportedErrorCode ?? null,
      })
      return
    }

    if (messageType === 'location') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'sticker') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'contacts') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'audio') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (messageType === 'document') {
      try {
        await sendWa(waRecipient, 'unsupported_message', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }
      return
    }

    if (
      (messageType === 'image' && mediaId && mediaType === 'image') ||
      (messageType === 'video' && mediaId && mediaType === 'video')
    ) {
      await handleWhatsAppInboundMedia(
        from,
        webhookClientId,
        supabaseAdmin,
        mediaId,
        mediaType as WaInboundMediaKind,
        waRecipient,
        sendWa,
        residentWhatsAppCreds,
        isTestWhatsAppSender
      )
      return
    }

    if (!textBody) {
      if (messageType === 'reaction') {
        try {
          await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
        } catch (sendError) {
          // WA send failure is non-fatal
        }
        return
      }
      const knownEmptyBodyTypes = new Set([
        'text',
        'image',
        'location',
        'contacts',
        'sticker',
        'audio',
        'video',
        'document',
        'reaction',
        'interactive',
        'button',
      ])
      if (!knownEmptyBodyTypes.has(messageType)) {
        try {
          await sendWa(
            waRecipient,
            'unsupported_message',
            residentWhatsAppCreds
          )
        } catch { /* WA send failure is non-fatal */ }
      }
      return
    }

    if (interactiveReplyId) {
      const pickedLang = parseLanguageButtonReplyId(interactiveReplyId)
      if (pickedLang) {
        residentLang = pickedLang
        await saveResidentLanguage(supabaseAdmin, webhookClientId, from, pickedLang, session?.id)
        try {
          await sendWa(waRecipient, 'welcome', residentWhatsAppCreds, {}, pickedLang)
        } catch { /* WA send failure is non-fatal */ }
        return
      }
    }

    // Short status keywords — open tickets for this reporter + tenant
    if (!textBody.toUpperCase().startsWith('START_') && isStatusQuestion(textBody)) {
      const { data: openRows } = await supabaseAdmin
        .from('tickets')
        .select('ticket_number, status, workers ( full_name )')
        .eq('reporter_phone', from)
        .eq('client_id', webhookClientId)
        .is('deleted_at', null)
        .neq('status', 'CLOSED')
        .order('created_at', { ascending: false })
        .limit(5)

      const lines =
        openRows?.map((row: {
          ticket_number: number
          status: string
          workers?: { full_name?: string | null } | { full_name?: string | null }[] | null
        }) => {
          const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
          let s = `תקלה #${row.ticket_number}: ${statusLabelHe(row.status)}.`
          if (isTicketInTreatment(row.status) && w?.full_name) {
            s += ` עובד ${w.full_name} מטפל.`
          }
          return s
        }) ?? []

      try {
        if (lines.length > 0) {
          await sendWa(waRecipient, 'ticket_status_list', residentWhatsAppCreds, {
            list: lines.join('\n'),
          })
        } else {
          await sendWa(waRecipient, 'no_open_tickets', residentWhatsAppCreds)
        }
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    // Product rule: WhatsApp session is single-purpose and short-lived.
    // Free-text should never be auto-logged into a previous ticket; after reset, it restarts project search flow.
    // STEP 1: START_<PROJECT_CODE> or START_<PROJECT_CODE>_<BUILDING>
    if (textBody.toUpperCase().startsWith('START_')) {
      const parsedStart = parseStartCode(textBody)

      if (!parsedStart) {
        try {
          await sendWa(waRecipient, 'qr_invalid', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      const { projectCode, buildingNumber } = parsedStart

      logger.info('WEBHOOK', 'START flow', { projectCode, hasBuilding: !!buildingNumber })

      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, name, project_code')
        .eq('project_code', projectCode)
        .eq('client_id', webhookClientId)
        .maybeSingle()

      if (projectError) {
        logger.error('WEBHOOK', 'project lookup failed', new Error(projectError.message), { projectCode })
        try { await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds) } catch {}
        return
      }

      if (!project) {
        try {
          await sendWa(waRecipient, 'project_not_found', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      const { error: deactivateError } = await supabaseAdmin
        .from('sessions')
        .update({
          is_active: false,
          last_activity_at: new Date().toISOString(),
        })
        .eq('phone_number', from)
        .eq('client_id', webhookClientId)
        .eq('is_active', true)

      if (deactivateError) {
        // Non-fatal: old sessions may linger, but we still create a new one and reply
        logger.warn('WEBHOOK', 'deactivate old sessions failed (continuing)', { err: deactivateError.message })
      }

      const qrLang = await preferredLanguageForNewSession(
        supabaseAdmin,
        webhookClientId,
        from,
        residentLang
      )
      residentLang = qrLang

      const { data: createdSession, error: sessionInsertError } = await supabaseAdmin
        .from('sessions')
        .insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: project.id,
          is_active: true,
          active_ticket_id: null,
          preferred_language: qrLang,
          last_activity_at: new Date().toISOString(),
        })
        .select('id, phone_number, project_id, is_active, preferred_language')
        .single()

      if (sessionInsertError) {
        logger.error('WEBHOOK', 'session insert failed', new Error(sessionInsertError.message))
        try { await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds) } catch {}
        return
      }

      logger.info('WEBHOOK', 'session created', { sessionId: createdSession.id, project: project.name })

      if (!isTestWhatsAppSender) {
        try {
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, project.id)
        } catch (residentErr) {
          logger.warn('WEBHOOK', 'getOrCreateResident failed (continuing)', { err: residentErr instanceof Error ? residentErr.message : String(residentErr) })
        }
      }

      try {
        const buildingLine = buildingNumber
          ? RESIDENT_UI_COPY[qrLang].buildingLine(buildingNumber)
          : ''
        await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
          project_name: project.name,
          building_line: buildingLine,
        }, qrLang)
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    const ticketPriority = resolveTicketPriorityFromResidentMessage(textBody)

    // סשן פעיל = אחרי סריקת QR או אחרי בחירת בניין בחיפוש (1/2/3 / התאמה אוטומטית)
    session = await getActiveSession(from, supabaseAdmin, webhookClientId)
    residentLang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, session)

    // זיכרון דייר: אם הטלפון כבר ב-residents — דלג על QR / חיפוש בניין
    if (!session && !isTestWhatsAppSender) {
      const knownResident = await findResidentByPhoneClient(supabaseAdmin, webhookClientId, from)
      if (knownResident?.project_id) {
        await supabaseAdmin
          .from('sessions')
          .update({
            is_active: false,
            last_activity_at: new Date().toISOString(),
          })
          .eq('phone_number', from)
          .eq('client_id', webhookClientId)
          .eq('is_active', true)

        const sessionLang = await preferredLanguageForNewSession(
          supabaseAdmin,
          webhookClientId,
          from,
          residentLang
        )

        const { error: insErr } = await supabaseAdmin.from('sessions').insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: knownResident.project_id,
          is_active: true,
          active_ticket_id: null,
          preferred_language: sessionLang,
          last_activity_at: new Date().toISOString(),
        })

        if (!insErr) {
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, knownResident.project_id)
          session = await getActiveSession(from, supabaseAdmin, webhookClientId)
          residentLang = sessionLang
          if (session) {
            if (isClarificationQuestion(textBody)) {
              try {
                await sendWhatsAppTextMessage(
                  waRecipient,
                  RESIDENT_UI_COPY[sessionLang].clarificationReply,
                  residentWhatsAppCreds,
                  { clientId: webhookClientId }
                )
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            if (!looksLikeTicketDescription(textBody)) {
              try {
                await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
                  reporter_name: residentGreetingPrefix(sessionLang, knownResident.full_name),
                }, sessionLang)
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            // else: fall through to ticket creation with textBody as description
          }
        }
      }
    }

    if (!session) {
      const isKnownResidentEarly =
        !isTestWhatsAppSender &&
        !!(await findResidentByPhoneClient(supabaseAdmin, webhookClientId, from))
      const isProjectListPick =
        !!interactiveReplyId && parseProjectListReplyId(interactiveReplyId) !== null

      if (!isKnownResidentEarly && !isProjectListPick) {
        const hasLang = await hasExplicitResidentLanguage(
          supabaseAdmin,
          webhookClientId,
          from,
          null
        )
        if (!hasLang) {
          try {
            await sendWaLanguageButtons(waRecipient, residentWhatsAppCreds)
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      // STEP 2.5: PENDING SELECTION (list reply or numeric 1/2/3)
      let selectedIndex: number | null = null
      if (interactiveReplyId) {
        const listIdx = parseProjectListReplyId(interactiveReplyId)
        if (listIdx !== null) selectedIndex = listIdx
      } else {
        const numericSelection = isNumericSelection(textBody)
        if (numericSelection !== null) selectedIndex = numericSelection - 1
      }
      let pendingSelection = await getPendingSelection(from, supabaseAdmin, webhookClientId)

      if (selectedIndex !== null && pendingSelection) {
        const candidates = pendingSelection.candidate_projects || []

        if (selectedIndex >= 0 && selectedIndex < candidates.length) {
          const selectedProject = candidates[selectedIndex]

          await supabaseAdmin
            .from('sessions')
            .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
            .eq('phone_number', from)
            .eq('client_id', webhookClientId)
            .eq('is_active', true)

          const sessionLang = pendingSelection.preferred_language?.trim()
            ? normalizeResidentLang(pendingSelection.preferred_language)
            : residentLang

          const { error: sessionCreateError } = await supabaseAdmin
            .from('sessions')
            .insert({
              phone_number: from,
              client_id: webhookClientId,
              project_id: selectedProject.id,
              is_active: true,
              active_ticket_id: null,
              preferred_language: sessionLang,
              last_activity_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (sessionCreateError) {
            logger.error('WEBHOOK', 'session create from selection failed', new Error(sessionCreateError.message))
            try {
              await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
            } catch { /* WA send failure is non-fatal */ }
            return
          }

          await clearPendingSelection(from, supabaseAdmin, webhookClientId)
          residentLang = sessionLang

          if (!isTestWhatsAppSender) {
            await getOrCreateResident(supabaseAdmin, webhookClientId, from, selectedProject.id)
          }

          try {
            await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
              project_name: selectedProject.name,
            }, sessionLang)
          } catch { /* WA send failure is non-fatal */ }

          return
        }
      }

      // INVALID SELECTION (outside range while pending exists)
      if (selectedIndex !== null && pendingSelection) {
        try {
          await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      // Pending selection + non-selection text: refine search or remind
      if (pendingSelection && selectedIndex === null) {
        if (isAddressLikeText(textBody)) {
          const candidates = pendingSelection.candidate_projects || []
          const sessionLang = pendingSelection.preferred_language?.trim()
            ? normalizeResidentLang(pendingSelection.preferred_language)
            : residentLang

          let refined = searchProjectsInList(candidates, textBody)
          if (refined.length === 0) {
            refined = await searchProjectsByBuilding(textBody, supabaseAdmin, webhookClientId)
          }

          if (refined.length === 1) {
            const matchedProject = refined[0]
            await clearPendingSelection(from, supabaseAdmin, webhookClientId)

            await supabaseAdmin
              .from('sessions')
              .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
              .eq('phone_number', from)
              .eq('client_id', webhookClientId)
              .eq('is_active', true)

            const { error: sessionCreateError } = await supabaseAdmin
              .from('sessions')
              .insert({
                phone_number: from,
                client_id: webhookClientId,
                project_id: matchedProject.id,
                is_active: true,
                active_ticket_id: null,
                preferred_language: sessionLang,
                last_activity_at: new Date().toISOString(),
              })
              .select()
              .single()

            if (sessionCreateError) {
              logger.error('WEBHOOK', 'session create from refine failed', new Error(sessionCreateError.message))
              try {
                await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
              } catch { /* WA send failure is non-fatal */ }
              return
            }

            if (!isTestWhatsAppSender) {
              await getOrCreateResident(supabaseAdmin, webhookClientId, from, matchedProject.id)
            }

            try {
              await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
                project_name: matchedProject.name,
              }, sessionLang)
            } catch { /* WA send failure is non-fatal */ }
            return
          }

          if (refined.length > 1) {
            await clearPendingSelection(from, supabaseAdmin, webhookClientId)
            const pendingCreated = await createPendingSelection(
              from,
              refined,
              supabaseAdmin,
              webhookClientId,
              sessionLang
            )
            if (!pendingCreated) {
              try {
                await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            try {
              await sendWaInteractiveList(
                waRecipient,
                refined,
                RESIDENT_UI_COPY[sessionLang].buildingListBody,
                residentWhatsAppCreds,
                sessionLang
              )
            } catch { /* WA send failure is non-fatal */ }
            return
          }

          try {
            await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds, {}, sessionLang)
          } catch { /* WA send failure is non-fatal */ }
          return
        }

        try {
          await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      const addressLike = isAddressLikeText(textBody)

      if (!addressLike) {
        if (isClarificationQuestion(textBody)) {
          const lang = await getResidentLanguage(supabaseAdmin, webhookClientId, from, null)
          try {
            await sendWhatsAppTextMessage(
              waRecipient,
              RESIDENT_UI_COPY[lang].clarificationReply,
              residentWhatsAppCreds,
              { clientId: webhookClientId }
            )
          } catch { /* WA send failure is non-fatal */ }
          return
        }
        if (isGreetingSmallTalk(textBody)) {
          const hasLang = await hasExplicitResidentLanguage(supabaseAdmin, webhookClientId, from, null)
          try {
            if (!hasLang) {
              await sendWaLanguageButtons(waRecipient, residentWhatsAppCreds)
            } else {
              await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
            }
          } catch { /* WA send failure is non-fatal */ }
          return
        }
        try {
          await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      let searchResults = await searchProjectsByBuilding(textBody, supabaseAdmin, webhookClientId)

      if (searchResults.length === 0) {
        // Try translating English input to Hebrew and search again
        try {
          const trUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=he&dt=t&q=${encodeURIComponent(textBody)}`
          const trRes = await fetchTimeout(trUrl, {}, 5000)
          if (trRes) {
            const trJson = await trRes.json() as unknown[][]
            const segments = trJson[0] as unknown[][]
            const hebrew = segments.map((s) => String((s as unknown[])[0] ?? '')).join('').trim()
            if (hebrew && hebrew !== textBody) {
              const translatedResults = await searchProjectsByBuilding(hebrew, supabaseAdmin, webhookClientId)
              if (translatedResults.length > 0) {
                searchResults = translatedResults
              }
            }
          }
        } catch { /* translation failure is non-fatal */ }
      }

      if (searchResults.length === 0) {
        try {
          await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      if (searchResults.length === 1) {
        const matchedProject = searchResults[0]

        await supabaseAdmin
          .from('sessions')
          .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
          .eq('phone_number', from)
          .eq('client_id', webhookClientId)
          .eq('is_active', true)

        const sessionLang = await preferredLanguageForNewSession(
          supabaseAdmin,
          webhookClientId,
          from,
          residentLang
        )

        const { error: sessionCreateError } = await supabaseAdmin
          .from('sessions')
          .insert({
            phone_number: from,
            client_id: webhookClientId,
            project_id: matchedProject.id,
            is_active: true,
            active_ticket_id: null,
            preferred_language: sessionLang,
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (sessionCreateError) {
          logger.error('WEBHOOK', 'session create from search match failed', new Error(sessionCreateError.message))
          return
        }

        if (!isTestWhatsAppSender) {
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, matchedProject.id)
        }

        try {
          await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
            project_name: matchedProject.name,
          }, sessionLang)
        } catch { /* WA send failure is non-fatal */ }

        return
      }

      // Multiple matches — store pending selection and send interactive list (up to 10)
      const pendingCreated = await createPendingSelection(
        from,
        searchResults,
        supabaseAdmin,
        webhookClientId,
        residentLang
      )

      if (!pendingCreated) {
        logger.warn('WEBHOOK', 'create pending selection failed, sending technical error')
        try {
          await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      try {
        await sendWaInteractiveList(
          waRecipient,
          searchResults,
          RESIDENT_UI_COPY[residentLang].buildingListBody,
          residentWhatsAppCreds,
          residentLang
        )
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    // Product rule: never keep active_ticket_id for text follow-ups.
    // Session is only used to bridge: (project identified) -> (ticket description) -> ticket created.

    let ticketDescription: string | null = null
    const knownResidentForSession =
      !isTestWhatsAppSender
        ? await findResidentByPhoneClient(supabaseAdmin, webhookClientId, from, session.project_id ?? undefined)
        : null
    const isKnownResident = !!knownResidentForSession

    if (interactiveReplyId && session?.id) {
      const confirmAction = parseConfirmButtonReplyId(interactiveReplyId)
      if (confirmAction === 'cancel') {
        await supabaseAdmin
          .from('sessions')
          .update({
            pending_ticket_description: null,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)
        try {
          await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }
      if (confirmAction === 'confirm') {
        const { data: pendingRow } = await supabaseAdmin
          .from('sessions')
          .select('pending_ticket_description')
          .eq('id', session.id)
          .maybeSingle()
        ticketDescription =
          (pendingRow as { pending_ticket_description?: string | null } | null)
            ?.pending_ticket_description?.trim() || null
        if (!ticketDescription) {
          try {
            await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
              reporter_name: residentGreetingPrefix(residentLang, knownResidentForSession?.full_name),
            })
          } catch { /* WA send failure is non-fatal */ }
          return
        }
        await supabaseAdmin
          .from('sessions')
          .update({ pending_ticket_description: null, last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
      }
    }

    if (!ticketDescription && session?.id && isTicketConfirmText(textBody)) {
      const { data: pendingRow } = await supabaseAdmin
        .from('sessions')
        .select('pending_ticket_description')
        .eq('id', session.id)
        .maybeSingle()
      const stashed =
        (pendingRow as { pending_ticket_description?: string | null } | null)
          ?.pending_ticket_description?.trim() || null
      if (stashed) {
        ticketDescription = stashed
        await supabaseAdmin
          .from('sessions')
          .update({ pending_ticket_description: null, last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
      }
    }

    if (!ticketDescription) {
      if (isClarificationQuestion(textBody)) {
        try {
          await sendWhatsAppTextMessage(
            waRecipient,
            RESIDENT_UI_COPY[residentLang].clarificationReply,
            residentWhatsAppCreds,
            { clientId: webhookClientId }
          )
        } catch { /* WA send failure is non-fatal */ }
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        return
      }

      if (!looksLikeTicketDescription(textBody)) {
        try {
          await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
            reporter_name: residentGreetingPrefix(residentLang, knownResidentForSession?.full_name),
          })
        } catch { /* WA send failure is non-fatal */ }
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        return
      }

      if (session.project_id) {
        const dupTicket = await findOpenTicketForReporterInWindow(from, webhookClientId, 30, supabaseAdmin)
        if (dupTicket) {
          await supabaseAdmin
            .from('sessions')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', session.id)
          try {
            await sendWa(waRecipient, 'duplicate_ticket', residentWhatsAppCreds, {
              ticket_number: String(dupTicket.ticket_number),
            })
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      if (isKnownResident) {
        ticketDescription = textBody
      } else {
        const preview =
          textBody.length > 180 ? `${textBody.slice(0, 177)}…` : textBody
        await supabaseAdmin
          .from('sessions')
          .update({
            pending_ticket_description: textBody,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)
        try {
          await sendWaConfirmButtons(
            waRecipient,
            `${RESIDENT_UI_COPY[residentLang].confirmTicketPrefix}\n\n${preview}`,
            residentWhatsAppCreds,
            residentLang
          )
        } catch { /* WA send failure is non-fatal */ }
        return
      }
    }

    if (session.project_id) {
      const dupTicket = await findOpenTicketForReporterInWindow(from, webhookClientId, 30, supabaseAdmin)
      if (dupTicket) {
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        try {
          await sendWa(waRecipient, 'duplicate_ticket', residentWhatsAppCreds, {
            ticket_number: String(dupTicket.ticket_number),
          })
        } catch { /* WA send failure is non-fatal */ }
        return
      }
    }

    const { data: existingProject, error: existingProjectError } = await supabaseAdmin
      .from('projects')
      .select('project_code, qr_identifier')
      .eq('id', session.project_id)
      .eq('client_id', webhookClientId)
      .maybeSingle()

    if (existingProjectError) {
      logger.warn('WEBHOOK', 'fetch project for building extraction failed', { err: existingProjectError.message })
    }

    let buildingNumber: string | null = null

    if (existingProject?.qr_identifier) {
      const parsedStart = parseStartCode(existingProject.qr_identifier)
      buildingNumber = parsedStart?.buildingNumber || null
    }

    const reporterDisplayName = reporterDisplayNameForNotification(
      waRecipient,
      knownResidentForSession?.full_name
    )
    const reporterNameForTicket =
      knownResidentForSession?.full_name?.trim() &&
      knownResidentForSession.full_name.trim() !== 'דייר WhatsApp'
        ? knownResidentForSession.full_name.trim()
        : null

    const { data: createdTicket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        client_id: webhookClientId,
        project_id: session.project_id,
        reporter_phone: from,
        reporter_name: reporterNameForTicket,
        description: ticketDescription,
        status: 'NEW',
        priority: ticketPriority,
        language: residentLang,
        source: 'whatsapp',
        building_number: buildingNumber,
      })
      .select('id, ticket_number, project_id, building_number')
      .single()

    if (ticketError) {
      logger.error('WEBHOOK', 'ticket insert failed', new Error(ticketError.message))
      void logWebhookOperationalError('ticket_create', ticketError.message, webhookClientId, {
        requestId,
        phone: from,
        projectId: session.project_id,
      }, clientName)
      try {
        await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
      } catch { /* non-fatal */ }
      return
    }

    await attachPendingWhatsAppMediaToTicketIfAny(
      from,
      webhookClientId,
      createdTicket.id,
      supabaseAdmin,
      residentWhatsAppCreds.accessToken
    )
    await attachPendingSessionLocationToTicketIfAny(from, webhookClientId, createdTicket.id, supabaseAdmin)

    const pendingForApproval =
      !!session.project_id &&
      (await queuePendingResidentApproval({
        supabase: supabaseAdmin,
        clientId: webhookClientId,
        projectId: session.project_id as string,
        ticketId: createdTicket.id,
        waFrom: waRecipient,
      }))

    if (session.project_id) {
      const autoAssign = await autoAssignTicketFromProject(supabaseAdmin, {
        ticketId: createdTicket.id,
        clientId: webhookClientId,
        projectId: session.project_id as string,
        ticketNumber: createdTicket.ticket_number as number,
        description: ticketDescription || null,
        smsSenderName,
      })
      if (autoAssign.assigned && autoAssign.assign && !autoAssign.assign.ok) {
        logger.warn('WEBHOOK', 'auto-assign from project failed', {
          ticketId: createdTicket.id,
          workerId: autoAssign.workerId,
          err: autoAssign.assign.error,
        })
      } else if (autoAssign.assigned) {
        logger.info('WEBHOOK', 'auto-assigned ticket from project worker', {
          ticketNumber: createdTicket.ticket_number,
          workerId: autoAssign.workerId,
        })
      }
    }

    // Predictive alert — fire-and-forget, never blocks the response
    void checkAndFlagRecurringIssue({
      supabase: supabaseAdmin,
      ticketId: createdTicket.id,
      clientId: webhookClientId,
      projectId: session.project_id as string,
      projectName: '',
      reporterPhone: from,
      ticketNumber: createdTicket.ticket_number,
      clientManagerPhone: clientManagerPhone ?? null,
      smsSenderName: smsSenderName ?? null,
    }).catch((e) => logger.warn('WEBHOOK', 'predictive-alert error', { err: e instanceof Error ? e.message : String(e) }))

    const { error: logError } = await supabaseAdmin
      .from('ticket_logs')
      .insert({
        ticket_id: createdTicket.id,
        action_type: 'CREATED_FROM_WHATSAPP',
        notes: `Ticket opened from WhatsApp by ${from}`,
        created_by: 'system',
        meta: {
          phone: from,
          source: 'whatsapp',
          building_number: buildingNumber,
        },
      })

    if (logError) {
      logger.warn('WEBHOOK', 'ticket_logs insert failed (non-blocking)', { err: logError.message })
    }

    logger.info('WEBHOOK', 'ticket created', { ticketNumber: createdTicket.ticket_number, clientId: webhookClientId })

    try {
      const { data: projectForNotification, error: projectNotificationError } = await supabaseAdmin
        .from('projects')
        .select('name, manager_phone, assigned_worker_id')
        .eq('id', session.project_id)
        .eq('client_id', webhookClientId)
        .single()

      if (projectNotificationError) {
        logger.warn('WEBHOOK', 'fetch project for notification failed', { err: projectNotificationError.message })
      } else if (projectForNotification) {
        const buildingLine = buildingNumber ? `בניין: ${buildingNumber}\n` : ''
        const smsMessage = await resolveSmsTemplateMessage(
          supabaseAdmin, webhookClientId,
          'sms_manager_new_ticket',
          SMS_TEMPLATE_EDITOR_DEFAULTS.sms_manager_new_ticket,
          {
            project_name: projectForNotification.name,
            building_line: buildingLine,
            ticket_number: String(createdTicket.ticket_number),
            description: ticketDescription || 'ללא פירוט',
            reporter_name: reporterDisplayName,
            dashboard_url: getPublicTicketsUrl(),
            client_name: clientName,
          }
        )

        if (smsOnTicketOpen) {
          const managerDestination = clientManagerPhone || projectForNotification.manager_phone || getManagerPhoneFromEnv()

          if (managerDestination) {
            const smsSent = await sendManagerSMS(managerDestination, smsMessage, smsSenderName, webhookClientId)
            if (!smsSent) {
              logger.warn('WEBHOOK', 'manager SMS failed', { ticketNumber: createdTicket.ticket_number })
            }
          }

          if (smsOnTicketOpen) {
            await notifyAlertWorkersOnNewTicket(supabaseAdmin, webhookClientId, {
              project_name: projectForNotification.name,
              ticket_number: createdTicket.ticket_number,
              description: ticketDescription || 'ללא פירוט',
              reporter_name: reporterDisplayName,
              sms_sender_name: smsSenderName,
              client_name: clientName,
            })
          }
        }
      }
    } catch (notifyManagerError) {
      logger.warn('WEBHOOK', 'manager notification error', { err: notifyManagerError instanceof Error ? notifyManagerError.message : String(notifyManagerError) })
    }

    try {
      const buildingText = buildingNumber ? `\nבניין: ${buildingNumber}` : ''

      const { data: projRow } = await supabaseAdmin
        .from('projects')
        .select('name')
        .eq('id', session.project_id)
        .eq('client_id', webhookClientId)
        .maybeSingle()

      const projectNameForWa = (projRow as { name?: string } | null)?.name || ''

      const ticketOpenedBody = resolveMessageForLanguage(
        await resolveWhatsAppTemplateMessage(
          supabaseAdmin,
          webhookClientId,
          'ticket_opened',
          WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['ticket_opened'],
          {
            building_line: buildingText,
            ticket_number: String(createdTicket.ticket_number),
            description: ticketDescription || '',
            reporter_name: reporterDisplayName,
            project_name: projectNameForWa,
          }
        ),
        residentLang
      )

      const pendingNote = pendingForApproval
        ? resolveMessageForLanguage(
            await resolveWhatsAppTemplateMessage(
              supabaseAdmin,
              webhookClientId,
              'pending_approval_note',
              WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['pending_approval_note']
            ),
            residentLang
          )
        : ''

      await sendWhatsAppTextMessage(
        waRecipient,
        ticketOpenedBody + pendingNote,
        residentWhatsAppCreds,
        { clientId: webhookClientId }
      )
    } catch { /* WA send failure is non-fatal; ticket was already created */ }

    // Product rule: if no image is sent, session must reset after ticket creation confirmation.
    // If an image is sent later, it will attach to the most recent open ticket for this phone.
    await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'ticket_created_text_flow_reset')

    return

  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    logger.error('WEBHOOK', 'Inbound background error', e, { requestId })
    void logWebhookOperationalError('unhandled', e.message, undefined, {
      requestId,
      stack: e.stack?.slice(0, 2000),
    })
  }
}
