import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
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
} from '@/lib/whatsapp-intent'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_EDITOR_DEFAULTS, SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'
import { resolveWhatsAppTemplateMessage, resolveSmsTemplateMessage } from '@/lib/whatsapp-templates'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'
import { autoAssignTicketFromProject } from '@/lib/assign-ticket-worker'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { getLogger } from '@/lib/logging'
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp-meta-signature'
import { checkWhatsAppWebhookPhoneRateLimit } from '@/lib/rate-limit'
import { getPublicTicketsUrl } from '@/lib/public-app-url'
import { isWhatsAppTestSender, whatsappDbPhoneKey, displayReporterForExternalMessage } from '@/lib/whatsapp-test-phone'
import { queuePendingResidentApproval } from '@/lib/pending-resident-from-ticket'
import { checkAndFlagRecurringIssue } from '@/lib/predictive-alerts'
import {
  findResidentByPhoneClient,
  getOrCreateResident,
  residentPromptGreetingPrefix,
} from '@/lib/residents-whatsapp'
import { fetchWithTimeout as fetchTimeout } from '@/lib/fetch-timeout'

export const maxDuration = 60

const logger = getLogger()

type ProjectRow = {
  id: string
  name: string
  project_code: string
  address?: string | null
}

function parseStartCode(text: string) {
  const match = text.trim().toUpperCase().match(/^START_(BMK\d+)(?:_(.+))?$/i)

  if (!match) return null

  return {
    projectCode: match[1],
    buildingNumber: match[2] ? match[2].trim() : null,
  }
}

// Search for projects by free-text building/address
async function searchProjectsByBuilding(
  searchText: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const trimmed = searchText.trim()

  // Require minimum 2 characters to search
  if (trimmed.length < 2) {
    return []
  }

  const lowerSearch = trimmed.toLowerCase()

  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, project_code, address')
    .eq('client_id', clientId)
    .order('project_code', { ascending: true })

  if (error) {
    logger.warn('WEBHOOK', 'project search error', { err: error.message })
    return []
  }

  // Filter projects by name, address, or code match (never expose full list)
  const matches = (projects || [])
    .filter((p: ProjectRow) =>
      p.name?.toLowerCase().includes(lowerSearch) ||
      p.address?.toLowerCase().includes(lowerSearch) ||
      p.project_code?.toLowerCase().includes(lowerSearch)
    )
    .slice(0, 3) // Max 3 results to prevent data leakage

  return matches
}

// Create pending selection state for multi-match scenario
async function createPendingSelection(
  phoneNumber: string,
  candidateProjects: ProjectRow[],
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes

  const { error } = await supabaseAdmin.from('pending_selections').insert({
    phone_number: phoneNumber,
    client_id: clientId,
    candidate_projects: candidateProjects,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  })

  if (error) {
    logger.warn('WEBHOOK', 'create pending selection failed', { err: error.message })
    return null
  }

  return true
}

// Get pending selection for a phone number
async function getPendingSelection(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { data, error } = await supabaseAdmin
    .from('pending_selections')
    .select('id, candidate_projects, created_at, expires_at')
    .eq('phone_number', phoneNumber)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'fetch pending selection failed', { err: error.message })
    return null
  }

  if (!data) {
    return null
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    await clearPendingSelection(phoneNumber, supabaseAdmin, clientId)
    return null
  }

  return data
}

// Clear pending selection for a phone number
async function clearPendingSelection(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { error } = await supabaseAdmin
    .from('pending_selections')
    .delete()
    .eq('phone_number', phoneNumber)
    .eq('client_id', clientId)

  if (error) {
    logger.warn('WEBHOOK', 'clear pending selection failed', { err: error.message })
  }
}

// Check if message is a valid numeric selection (1, 2, or 3)
function isNumericSelection(text: string): number | null {
  const trimmed = text.trim()
  const num = parseInt(trimmed, 10)

  if (!isNaN(num) && num >= 1 && num <= 3 && trimmed === String(num)) {
    return num
  }

  return null
}

// Expire temporary WhatsApp session flow state if inactive
// Sessions without tickets expire after 20 minutes (incomplete flow)
// Sessions with active tickets expire after 30 minutes (follow-up context)
// This does NOT close actual tickets - only clears temporary session state
async function expireInactiveSessions(supabaseAdmin: SupabaseClient, clientId: string) {
  const now = new Date()
  
  // Threshold 1: Sessions without tickets (incomplete flow) - 20 minutes
  const incompleteThreshold = new Date(now.getTime() - 20 * 60 * 1000)
  
  // Threshold 2: Sessions with tickets (follow-up context) - 30 minutes
  const followUpThreshold = new Date(now.getTime() - 30 * 60 * 1000)

  try {
    // Expire incomplete sessions (no active_ticket_id) after 20 minutes
    const { error: incompleteError } = await supabaseAdmin
      .from('sessions')
      .update({
        is_active: false,
        updated_at: now.toISOString(),
      })
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('active_ticket_id', null)
      .lt('last_activity_at', incompleteThreshold.toISOString())

    if (incompleteError) {
      logger.warn('WEBHOOK', 'expire incomplete sessions failed', { err: incompleteError.message })
    }

    // Expire follow-up sessions (with active_ticket_id) after 30 minutes
    const { error: followUpError } = await supabaseAdmin
      .from('sessions')
      .update({
        is_active: false,
        active_ticket_id: null,
        updated_at: now.toISOString(),
      })
      .eq('client_id', clientId)
      .eq('is_active', true)
      .not('active_ticket_id', 'is', null)
      .lt('last_activity_at', followUpThreshold.toISOString())

    if (followUpError) {
      logger.warn('WEBHOOK', 'expire follow-up sessions failed', { err: followUpError.message })
    }
  } catch (error) {
    logger.warn('WEBHOOK', 'expireInactiveSessions unexpected error', { err: error instanceof Error ? error.message : String(error) })
  }
}

type SessionRow = {
  id: string
  phone_number: string
  project_id: string | null
  active_ticket_id: string | null
  is_active: boolean
  pending_whatsapp_media_id?: string | null
  pending_apartment_detail?: string | null
}

async function getActiveSession(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<SessionRow | null> {
  // Core columns only — migrations 013/014 add optional columns; selecting missing columns returns null session and breaks the flow.
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, phone_number, project_id, active_ticket_id, is_active')
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'fetch active session failed', { err: error.message })
    return null
  }

  return (data as SessionRow | null) || null
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

async function findRecentTicketForPhone(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<{ id: string; status: string; created_at: string } | null> {
  // Product rule: sessions reset after ticket creation, but user may send an image immediately after.
  // So we allow attaching an image to the most recent ticket for this phone within a short window.
  const windowMinutes = 10
  const sinceIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, status, created_at')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'find recent ticket failed', { err: error.message })
    return null
  }

  if (!data?.id || !data?.created_at || !data?.status) return null
  return data as { id: string; status: string; created_at: string }
}

/** If the user sent an image before the first text in this session, attach it to the new ticket. */
async function attachPendingWhatsAppImageToTicketIfAny(
  from: string,
  clientId: string,
  ticketId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  const { data: openSession, error } = await supabaseAdmin
    .from('sessions')
    .select('id, pending_whatsapp_media_id')
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string }).message || '')
    if (msg.includes('pending_whatsapp_media_id') || (error as { code?: string }).code === '42703') {
      return false
    }
    logger.warn('WEBHOOK', 'pending image: could not load session', { err: (error as { message?: string }).message })
    return false
  }

  const pendingId = (openSession as { pending_whatsapp_media_id?: string | null } | null)
    ?.pending_whatsapp_media_id
  const sessionId = (openSession as { id?: string } | null)?.id
  if (!pendingId || !sessionId) return false

  const { error: clearPendingErr } = await supabaseAdmin
    .from('sessions')
    .update({
      pending_whatsapp_media_id: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (clearPendingErr) {
    const m = String((clearPendingErr as { message?: string }).message || '')
    if (m.includes('pending_whatsapp_media_id') || (clearPendingErr as { code?: string }).code === '42703') {
      await supabaseAdmin
        .from('sessions')
        .update({
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  }

  const mediaData = await downloadWhatsAppMedia(pendingId, 'image')
  if (!mediaData) {
    logger.warn('WEBHOOK', 'pending image: download failed', { pendingId, ticketId })
    return false
  }

  const uploadResult = await uploadWhatsAppMediaToStorage(
    ticketId,
    mediaData.buffer,
    mediaData.fileName,
    mediaData.mimeType
  )
  if (!uploadResult) {
    logger.warn('WEBHOOK', 'pending image: storage upload failed', { ticketId })
    return false
  }

  const ok = await createAttachmentRecord(
    supabaseAdmin,
    ticketId,
    mediaData.fileName,
    uploadResult.filePath,
    uploadResult.fileSize,
    mediaData.mimeType,
    pendingId,
    'whatsapp_image'
  )
  return !!ok
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

type WaLocation = { lat: number; lng: number; name?: string; address?: string }

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
type WaWebhookTenant = { clientId: string; row: Record<string, unknown> }

async function runWhatsAppInboundBackground(
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
      vars: WaTemplateVars = {}
    ) {
      const msg = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        templateKey,
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS[templateKey],
        vars
      )
      logger.info('WEBHOOK', 'WA template send', {
        requestId,
        templateKey,
        to: isWhatsAppTestSender(to) ? '(test)' : `…${to.slice(-4)}`,
      })
      return sendWhatsAppTextMessage(to, msg, creds, { clientId: webhookClientId })
    }

    // Expire temporary WhatsApp session state if inactive (scoped to this tenant)
    // Fire-and-forget: don't block the critical message-handling path if Supabase is slow/ETIMEDOUT
    void expireInactiveSessions(supabaseAdmin, webhookClientId)

    const { from: waFrom, messageType, textBody, mediaId, mediaType, location: waLocation } = parsedMessage
    const waRecipient = waFrom
    const from = whatsappDbPhoneKey(waFrom)
    const isTestWhatsAppSender = isWhatsAppTestSender(waFrom)

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

      const recentTicket = await findRecentTicketForPhone(from, supabaseAdmin, webhookClientId)
      if (recentTicket && recentTicket.status !== 'CLOSED') {
        await mergeWhatsAppLocationIntoTicketMetadata(supabaseAdmin, recentTicket.id, loc)
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

    // Location messages: archived — redirect resident to describe in text
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

    if (messageType === 'video' || messageType === 'document') {
      try {
        await sendWa(waRecipient, 'unsupported_message', residentWhatsAppCreds)
      } catch (sendError) {
        // WA send failure is non-fatal
      }
      return
    }

    // HANDLE IMAGE MESSAGES
    if (messageType === 'image' && mediaId && mediaType === 'image') {

      // Check if user has an active session/ticket context
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
        logger.warn('WEBHOOK', 'fetch session for image attachment failed', { err: sessionError.message })
      }

      // Case A: Active ticket exists - attach image to it
      if (session?.active_ticket_id) {
        const ticketId = session.active_ticket_id
        let failureReason = ''

        const mediaData = await downloadWhatsAppMedia(mediaId, 'image')

        if (!mediaData) {
          failureReason = 'DOWNLOAD_FAILED'
          logger.warn('WEBHOOK', 'image download failed', { mediaId, ticketId, failureReason })
        } else {
          const uploadResult = await uploadWhatsAppMediaToStorage(
            ticketId,
            mediaData.buffer,
            mediaData.fileName,
            mediaData.mimeType
          )

          if (uploadResult) {
            const attachmentCreated = await createAttachmentRecord(
              supabaseAdmin,
              ticketId,
              mediaData.fileName,
              uploadResult.filePath,
              uploadResult.fileSize,
              mediaData.mimeType,
              mediaId,
              'whatsapp_image'
            )

            if (attachmentCreated) {
              logger.info('WEBHOOK', 'image attached to ticket', { ticketId })
              try {
                await sendWa(waRecipient, 'image_attached', residentWhatsAppCreds)
              } catch { /* WA send failure is non-fatal */ }

              // Product rule: after image confirmation, reset to default state
              await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'image_processed_success')
              return
            } else {
              failureReason = 'DB_INSERT_FAILED'
              logger.warn('WEBHOOK', 'image attachment DB insert failed', { ticketId, failureReason })
            }
          } else {
            failureReason = 'STORAGE_UPLOAD_FAILED'
            logger.warn('WEBHOOK', 'image storage upload failed', { ticketId, failureReason })
          }
        }

        // Fallback: Image download/upload failed but ticket exists, preserve it
        logger.warn('WEBHOOK', 'image attach failed, sending fallback', { ticketId, failureReason })
        try {
          await sendWa(waRecipient, 'image_failed', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }

        // Product rule: reset to default state after image attempt
        await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'image_processed_failure')
        return
      }

      // Case A5: Building known (session) but ticket not created yet — keep image until first text opens ticket
      if (session?.project_id && !session.active_ticket_id && session.id) {
        const { error: stashErr } = await supabaseAdmin
          .from('sessions')
          .update({
            pending_whatsapp_media_id: mediaId,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)

        if (stashErr) {
          logger.warn('WEBHOOK', 'stash pending image failed', { err: stashErr.message })
        } else {
          try {
            await sendWa(waRecipient, 'image_stashed', residentWhatsAppCreds)
          } catch { /* WA send failure is non-fatal */ }
        }

        return
      }

      // Case B: No session/ticket context - attach to most recent ticket for this phone (short window)
      const recentTicket = await findRecentTicketForPhone(from, supabaseAdmin, webhookClientId)
      if (recentTicket && recentTicket.status !== 'CLOSED') {
        const ticketId = recentTicket.id
        let failureReason = ''

        const mediaData = await downloadWhatsAppMedia(mediaId, 'image')

        if (!mediaData) {
          failureReason = 'DOWNLOAD_FAILED'
        } else {
          const uploadResult = await uploadWhatsAppMediaToStorage(
            ticketId,
            mediaData.buffer,
            mediaData.fileName,
            mediaData.mimeType
          )

          if (uploadResult) {
            const attachmentCreated = await createAttachmentRecord(
              supabaseAdmin,
              ticketId,
              mediaData.fileName,
              uploadResult.filePath,
              uploadResult.fileSize,
              mediaData.mimeType,
              mediaId,
              'whatsapp_image'
            )

            if (attachmentCreated) {
              logger.info('WEBHOOK', 'image attached to recent ticket', { ticketId })
              try {
                await sendWa(waRecipient, 'image_attached', residentWhatsAppCreds)
              } catch { /* WA send failure is non-fatal */ }

              await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'recent_ticket_image_processed_success')

              return
            } else {
              failureReason = 'DB_INSERT_FAILED'
            }
          } else {
            failureReason = 'STORAGE_UPLOAD_FAILED'
          }
        }

        logger.warn('WEBHOOK', 'recent-ticket image attach failed', { ticketId, failureReason })
        try {
          await sendWa(waRecipient, 'image_failed', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }

        await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'recent_ticket_image_processed_failure')

        return
      }

      // Case C: No context and no recent ticket - guide user to start flow
      try {
        await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
      } catch { /* WA send failure is non-fatal */ }

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

      const { data: createdSession, error: sessionInsertError } = await supabaseAdmin
        .from('sessions')
        .insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: project.id,
          is_active: true,
          active_ticket_id: null,
          last_activity_at: new Date().toISOString(),
        })
        .select('id, phone_number, project_id, is_active')
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
        const buildingLine = buildingNumber ? ` (בניין ${buildingNumber})` : ''
        await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
          project_name: project.name,
          building_line: buildingLine,
        })
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    const ticketPriority = resolveTicketPriorityFromResidentMessage(textBody)

    // סשן פעיל = אחרי סריקת QR או אחרי בחירת בניין בחיפוש (1/2/3 / התאמה אוטומטית)
    let session = await getActiveSession(from, supabaseAdmin, webhookClientId)

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

        const { error: insErr } = await supabaseAdmin.from('sessions').insert({
          phone_number: from,
          client_id: webhookClientId,
          project_id: knownResident.project_id,
          is_active: true,
          active_ticket_id: null,
          last_activity_at: new Date().toISOString(),
        })

        if (!insErr) {
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, knownResident.project_id)
          session = await getActiveSession(from, supabaseAdmin, webhookClientId)
          if (session) {
            if (!looksLikeTicketDescription(textBody)) {
              try {
                await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
                  reporter_name: residentPromptGreetingPrefix(knownResident.full_name),
                })
              } catch { /* WA send failure is non-fatal */ }
              return
            }
            // else: fall through to ticket creation with textBody as description
          }
        }
      }
    }

    if (!session) {
      // STEP 2.5: PENDING SELECTION HANDLING (user replies with number 1/2/3)
      const numericSelection = isNumericSelection(textBody)
      let pendingSelection = await getPendingSelection(from, supabaseAdmin, webhookClientId)

      if (numericSelection && pendingSelection) {
        const candidates = pendingSelection.candidate_projects || []
        const selectedIndex = numericSelection - 1

        if (selectedIndex >= 0 && selectedIndex < candidates.length) {
          const selectedProject = candidates[selectedIndex]

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
              project_id: selectedProject.id,
              is_active: true,
              active_ticket_id: null,
              last_activity_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (sessionCreateError) {
            logger.error('WEBHOOK', 'session create from selection failed', new Error(sessionCreateError.message))
            return
          }

          await clearPendingSelection(from, supabaseAdmin, webhookClientId)

          if (!isTestWhatsAppSender) {
            await getOrCreateResident(supabaseAdmin, webhookClientId, from, selectedProject.id)
          }

          try {
            await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
              project_name: selectedProject.name,
            })
          } catch { /* WA send failure is non-fatal */ }

          return
        }
      }

      // INVALID NUMERIC SELECTION (number outside range while pending exists)
      if (numericSelection && pendingSelection) {
        try {
          await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      // Pending selection + non-numeric: either refine search (address-like) or remind to pick 1/2/3
      if (pendingSelection && !numericSelection) {
        if (isAddressLikeText(textBody)) {
          await clearPendingSelection(from, supabaseAdmin, webhookClientId)
          pendingSelection = null
        } else {
          try {
            await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
          } catch { /* WA send failure is non-fatal */ }
          return
        }
      }

      const addressLike = isAddressLikeText(textBody)

      if (!addressLike) {
        if (isGreetingSmallTalk(textBody)) {
          try {
            await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
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

        const { error: sessionCreateError } = await supabaseAdmin
          .from('sessions')
          .insert({
            phone_number: from,
            client_id: webhookClientId,
            project_id: matchedProject.id,
            is_active: true,
            active_ticket_id: null,
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
          })
        } catch { /* WA send failure is non-fatal */ }

        return
      }

      // Multiple matches (2-3) - store pending selection and send numbered list
      const pendingCreated = await createPendingSelection(
        from,
        searchResults,
        supabaseAdmin,
        webhookClientId
      )

      if (!pendingCreated) {
        logger.warn('WEBHOOK', 'create pending selection failed, sending technical error')
        try {
          await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
        } catch { /* WA send failure is non-fatal */ }
        return
      }

      // Build numbered list and inject as {{list}} variable into the template
      const listLines = searchResults.map((project: ProjectRow, index: number) => {
        const addressText = project.address ? ` (${project.address})` : ''
        return `${index + 1}. ${project.name}${addressText}`
      })

      try {
        await sendWa(waRecipient, 'building_multiple_matches', residentWhatsAppCreds, {
          list: listLines.join('\n'),
        })
      } catch { /* WA send failure is non-fatal */ }

      return
    }

    // Product rule: never keep active_ticket_id for text follow-ups.
    // Session is only used to bridge: (project identified) -> (ticket description) -> ticket created.

    if (!looksLikeTicketDescription(textBody)) {
      const known = await findResidentByPhoneClient(supabaseAdmin, webhookClientId, from)
      try {
        await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds, {
          reporter_name: residentPromptGreetingPrefix(known?.full_name),
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
          await sendWa(waRecipient, 'duplicate_ticket', residentWhatsAppCreds, { ticket_number: String(dupTicket.ticket_number) })
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

    const ticketDescription = textBody

    const { data: createdTicket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        client_id: webhookClientId,
        project_id: session.project_id,
        reporter_phone: from,
        description: ticketDescription,
        status: 'NEW',
        priority: ticketPriority,
        language: 'he',
        source: 'whatsapp',
        building_number: buildingNumber,
      })
      .select('id, ticket_number, project_id, building_number')
      .single()

    if (ticketError) {
      logger.error('WEBHOOK', 'ticket insert failed', new Error(ticketError.message))
      return
    }

    await attachPendingWhatsAppImageToTicketIfAny(from, webhookClientId, createdTicket.id, supabaseAdmin)
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
            reporter_name: displayReporterForExternalMessage(waRecipient),
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

      const ticketOpenedBody = await resolveWhatsAppTemplateMessage(
        supabaseAdmin,
        webhookClientId,
        'ticket_opened',
        WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['ticket_opened'],
        {
          building_line: buildingText,
          ticket_number: String(createdTicket.ticket_number),
          description: ticketDescription || '',
          reporter_name: displayReporterForExternalMessage(waRecipient),
          project_name: projectNameForWa,
        }
      )

      const pendingNote = pendingForApproval
        ? await resolveWhatsAppTemplateMessage(
            supabaseAdmin,
            webhookClientId,
            'pending_approval_note',
            WHATSAPP_TEMPLATE_EDITOR_DEFAULTS['pending_approval_note']
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
    // If an image is sent right after, it will attach via recent-ticket lookup (short window).
    await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'ticket_created_text_flow_reset')

    return

  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    logger.error('WEBHOOK', 'Inbound background error', e, { requestId })
  }
}

export async function GET(req: NextRequest) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ''
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (!VERIFY_TOKEN) {
    return new NextResponse('Server configuration error', { status: 500 })
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || 'OK', { status: 200 })
  }

  return new NextResponse('Verification failed', { status: 403 })
}

export async function POST(req: NextRequest) {
  const requestId = `webhook-whatsapp-${Date.now()}`
  logger.info('WEBHOOK', 'WhatsApp webhook POST received', { requestId })

  try {
    const rawBody = await req.text()
    const metaSecret = (process.env.WHATSAPP_APP_SECRET || '').trim()
    const sigHdr = req.headers.get('x-hub-signature-256')

    if (metaSecret && !verifyWhatsAppWebhookSignature(rawBody, sigHdr, metaSecret)) {
      logger.error('WEBHOOK', 'invalid signature', new Error('meta_signature_mismatch'), { requestId })
      return NextResponse.json({ error: 'invalid signature' }, { status: 403 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    let supabaseAdmin: SupabaseClient
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      const error = envError instanceof Error ? envError : new Error(String(envError))
      logger.error('WEBHOOK', 'Failed to initialize Supabase admin', error, { requestId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    logger.debug('WEBHOOK', 'Webhook payload received', {
      requestId,
      bytes: rawBody.length,
      hasEntry: Array.isArray((body as { entry?: unknown }).entry),
    })

    const parsedMessage = parseIncomingWhatsAppMessage(body)

    if (!parsedMessage) {
      logger.debug('WEBHOOK', 'no user message in payload', { requestId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const phoneNumberId = extractWhatsAppPhoneNumberId(body)
    if (!phoneNumberId) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const waRl = await checkWhatsAppWebhookPhoneRateLimit(supabaseAdmin, phoneNumberId)
    if (waRl.isLimited) {
      logger.warn('WEBHOOK', 'rate limited', { requestId, phoneNumberId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const tenantResolved = await resolveClientIdByWhatsAppPhoneNumberId(supabaseAdmin, phoneNumberId)
    if (!tenantResolved) {
      logger.error(
        'WEBHOOK',
        'No client for WhatsApp phone_number_id',
        new Error('no_client_for_phone_number_id'),
        { requestId, phoneNumberId }
      )
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const dedupeMessageId = webhookDedupeMessageId(parsedMessage)
    const { error: dupErr } = await supabaseAdmin.from('processed_webhooks').insert({
      message_id: dedupeMessageId,
      client_id: tenantResolved.clientId,
    })
    if (dupErr && dupErr.code === '23505') {
      logger.debug('WEBHOOK', 'duplicate message ignored', { requestId, dedupeMessageId })
      return NextResponse.json({ received: true }, { status: 200 })
    }
    if (dupErr) {
      logger.warn('WEBHOOK', 'dedupe insert failed, continuing', { requestId, dedupeMessageId, err: dupErr.message })
      // Do NOT return — continue processing the message
    }

    const tenantPayload: WaWebhookTenant = {
      clientId: tenantResolved.clientId,
      row: tenantResolved.row,
    }

    await runWhatsAppInboundBackground(
      body,
      requestId,
      parsedMessage,
      supabaseAdmin,
      tenantPayload
    )
    return NextResponse.json({ received: true, status: 'ok' }, { status: 200 })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('WEBHOOK', 'WhatsApp webhook POST error', err, { requestId })
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

