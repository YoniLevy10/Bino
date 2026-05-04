import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveClientIdByWhatsAppPhoneNumberId } from '@/lib/tenant-resolution'
import {
  parseIncomingWhatsAppMessage,
  isAddressLikeText,
  extractWhatsAppPhoneNumberId,
  type ParsedWhatsAppMessage,
} from '@/lib/whatsapp-parser'
import { webhookDedupeMessageId } from '@/lib/whatsapp-webhook-dedupe'
import {
  isStatusQuestion,
  resolveTicketPriorityFromResidentMessage,
  statusLabelHe,
} from '@/lib/whatsapp-intent'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'
import { resolveWhatsAppTemplateMessage } from '@/lib/whatsapp-templates'
import { sendManagerSMS, sendWorkerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { getLogger } from '@/lib/logging'
import { logger as webhookJsonLogger } from '@/lib/logger'
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp-meta-signature'
import { checkWhatsAppWebhookPhoneRateLimit } from '@/lib/rate-limit'
import { getPublicTicketsUrl } from '@/lib/public-app-url'
import { isWhatsAppTestSender, whatsappDbPhoneKey, displayReporterForExternalMessage } from '@/lib/whatsapp-test-phone'
import { queuePendingResidentApproval } from '@/lib/pending-resident-from-ticket'
import { findResidentByPhoneClient, getOrCreateResident } from '@/lib/residents-whatsapp'

// ARCHIVED: Old WhatsApp manager notification
// This module previously sent WhatsApp messages to project managers
// CURRENT STATUS: Using SMS for manager notifications (temporary, while awaiting WhatsApp template approval)

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
    console.error('❌ Error searching projects:', error)
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
    console.error('❌ Error creating pending selection:', error)
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
    console.error('⚠️ Error fetching pending selection:', error)
    return null
  }

  if (!data) {
    return null
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    console.log('⏰ Pending selection expired, clearing it')
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
    console.error('⚠️ Error clearing pending selection:', error)
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

function logWhatsAppRuntimePath(
  tag: string,
  params: {
    textBody: string
    phone_number: string
    session: { project_id?: unknown; active_ticket_id?: unknown } | null | undefined
  }
) {
  const { textBody, phone_number, session } = params
  console.log(tag, {
    textBody,
    phone_number,
    session_exists: !!session,
    project_id: session && 'project_id' in session ? (session as { project_id?: unknown }).project_id : null,
    active_ticket_id:
      session && 'active_ticket_id' in session
        ? (session as { active_ticket_id?: unknown }).active_ticket_id
        : null,
  })
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
      console.error('⚠️ Error expiring incomplete sessions:', incompleteError)
    } else {
      console.log('✅ Expired incomplete WhatsApp sessions (no ticket, 20min+ inactive)')
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
      console.error('⚠️ Error expiring follow-up sessions:', followUpError)
    } else {
      console.log('✅ Expired follow-up WhatsApp sessions (with ticket, 30min+ inactive)')
    }
  } catch (error) {
    console.error('⚠️ Unexpected error in expireInactiveSessions:', error)
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
    console.error('❌ Error fetching active session:', error)
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
  console.log('🧼 SESSION_RESET: Clearing WhatsApp session state', { from, reason })

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
    console.error('⚠️ SESSION_RESET_FAILED: Could not deactivate sessions', { from, reason, error })
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
    console.error('⚠️ Failed to fetch ticket status:', { ticketId, error })
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
    console.error('⚠️ Failed to find recent ticket for phone:', { from, error })
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
    console.error('⚠️ pending image: could not load session', { from, error })
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
    console.error('⚠️ pending image: download failed', { pendingId, ticketId })
    return false
  }

  const uploadResult = await uploadWhatsAppMediaToStorage(
    ticketId,
    mediaData.buffer,
    mediaData.fileName,
    mediaData.mimeType
  )
  if (!uploadResult) {
    console.error('⚠️ pending image: storage upload failed', { ticketId })
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

/** Same reporter + tenant, non-closed ticket opened within the last N minutes (duplicate guard). */
async function findOpenTicketForReporterInWindow(
  from: string,
  clientId: string,
  windowMinutes: number,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string; ticket_number: number; description: string | null; status: string } | null> {
  const sinceIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
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
    console.error('⚠️ mergeWhatsAppLocationIntoTicketMetadata failed:', error)
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
    console.error('⚠️ pending location: could not load session', { from, error })
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
      console.error('⚠️ pending location: clear failed', clearErr)
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
    } | null

    if (tenantPreResolved) {
      webhookClientId = tenantPreResolved.clientId
      waClient = tenantPreResolved.row as typeof waClient
    } else {
      const phoneNumberId = extractWhatsAppPhoneNumberId(body)
      if (!phoneNumberId) {
        console.error('❌ Missing WhatsApp phone_number_id in webhook metadata')
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
      return sendWhatsAppTextMessage(to, msg, creds, { clientId: webhookClientId })
    }

    // Expire temporary WhatsApp session state if inactive (scoped to this tenant)
    await expireInactiveSessions(supabaseAdmin, webhookClientId)

    const { from: waFrom, messageType, textBody, mediaId, mediaType, location: waLocation } = parsedMessage
    const waRecipient = waFrom
    const from = whatsappDbPhoneKey(waFrom)
    const isTestWhatsAppSender = isWhatsAppTestSender(waFrom)

    console.log('📞 From:', isTestWhatsAppSender ? '(מספר בדיקות — לא נשמר במערכת)' : '(redacted)')
    console.log('🧩 Message Type:', messageType)
    console.log('💬 Message body:', textBody)
    console.log('📎 Media ID:', mediaId)
    console.log('📎 Media Type:', mediaType)
    
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
        console.error('❌ Error fetching session for location:', sessionError)
      }

      if (session?.active_ticket_id) {
        await mergeWhatsAppLocationIntoTicketMetadata(supabaseAdmin, session.active_ticket_id, loc)
        try {
          await sendWa(waRecipient, 'location_attached', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send location ack (active ticket):', sendError)
        }
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
        } catch (sendError) {
          console.error('⚠️ Failed to send location ack (recent ticket):', sendError)
        }
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
            console.error('❌ pending_location stash failed:', stashErr)
          }
        }

        try {
          await sendWa(waRecipient, 'location_stashed', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send location-before-text:', sendError)
        }
        return
      }

      try {
        await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send location-context guidance:', sendError)
      }
    }

    if (messageType === 'location') {
      if (waLocation) {
        await handleInboundLocation(waLocation)
      } else {
        try {
          await sendWa(waRecipient, 'location_error', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send invalid-location reply:', sendError)
        }
      }
      return
    }

    if (messageType === 'sticker') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send sticker reply:', sendError)
      }
      return
    }

    if (messageType === 'contacts') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send contacts reply:', sendError)
      }
      return
    }

    if (messageType === 'audio') {
      try {
        await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send audio reply:', sendError)
      }
      return
    }

    if (messageType === 'video' || messageType === 'document') {
      try {
        await sendWa(waRecipient, 'unsupported_message', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send unsupported-media reply:', sendError)
      }
      return
    }

    // HANDLE IMAGE MESSAGES
    if (messageType === 'image' && mediaId && mediaType === 'image') {
      console.log('🖼️ Image message received - downloading and attaching to ticket')

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
        console.error('❌ Error fetching session for image attachment:', sessionError)
      }

      // Case A: Active ticket exists - attach image to it
      if (session?.active_ticket_id) {
        const ticketId = session.active_ticket_id
        let failureReason = ''

        console.log(`📍 Active ticket found for ${from} - attaching image to ticket: ${ticketId}`)

        // Step 1: Download media from WhatsApp
        console.log(`⏳ PIPELINE_STEP: 1/4 Downloading image from WhatsApp (mediaId: ${mediaId})`)
        const mediaData = await downloadWhatsAppMedia(mediaId, 'image')

        if (!mediaData) {
          failureReason = 'DOWNLOAD_FAILED'
          console.error(`❌ PIPELINE_FAILURE: Step 1 DOWNLOAD - Could not download media from WhatsApp`, {
            failureReason,
            mediaId,
            ticketId,
          })
          // Fall through to fallback message (ticket already exists, preserve it)
        } else {
          console.log(`✅ PIPELINE_SUCCESS: Step 1 DOWNLOAD - Downloaded ${mediaData.fileName} (${mediaData.mimeType}, ${mediaData.buffer.length} bytes)`)

          // Step 2: Upload to Supabase Storage
          console.log(`⏳ PIPELINE_STEP: 2/4 Uploading to Supabase Storage`)
          const uploadResult = await uploadWhatsAppMediaToStorage(
            ticketId,
            mediaData.buffer,
            mediaData.fileName,
            mediaData.mimeType
          )

          if (uploadResult) {
            console.log(`✅ PIPELINE_SUCCESS: Step 2 UPLOAD - File stored at ${uploadResult.filePath}`)

            // Step 3: Create database record
            console.log(`⏳ PIPELINE_STEP: 3/4 Creating attachment database record`)
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
              console.log(`✅ PIPELINE_SUCCESS: Step 3 DB_INSERT - Attachment record created`)

              // Step 4: Send confirmation message
              console.log(`⏳ PIPELINE_STEP: 4/4 Sending WhatsApp confirmation`)
              try {
                await sendWa(waRecipient, 'image_attached', residentWhatsAppCreds)
                console.log(`✅ PIPELINE_SUCCESS: Step 4 USER_MSG - Confirmation message sent`)
              } catch (sendError) {
                console.error('⚠️ PIPELINE_WARNING: Step 4 failed to send confirmation (attachment was successful)', {
                  error: sendError,
                  ticketId,
                })
              }

              // Product rule: after image confirmation, reset to default state
              await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'image_processed_success')
              return
            } else {
              failureReason = 'DB_INSERT_FAILED'
              console.error(`❌ PIPELINE_FAILURE: Step 3 DB_INSERT - Attachment record creation failed`, {
                failureReason,
                ticketId,
                fileName: mediaData.fileName,
              })
            }
          } else {
            failureReason = 'STORAGE_UPLOAD_FAILED'
            console.error(`❌ PIPELINE_FAILURE: Step 2 UPLOAD - Supabase Storage upload failed`, {
              failureReason,
              ticketId,
              fileName: mediaData.fileName,
            })
          }
        }

        // Fallback: Image download/upload failed but ticket exists, preserve it
        console.log(`📤 PIPELINE_FALLBACK: Sending user message - attachment failed but ticket preserved`, {
          failureReason,
          ticketId,
        })
        try {
          await sendWa(waRecipient, 'image_failed', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ PIPELINE_WARNING: Failed to send fallback message', {
            error: sendError,
            ticketId,
          })
        }

        // Product rule: reset to default state after image attempt
        await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'image_processed_failure')
        return
      }

      // Case A5: Building known (session) but ticket not created yet — keep image until first text opens ticket
      if (session?.project_id && !session.active_ticket_id && session.id) {
        console.log(`📍 Open session (no ticket row yet) — stashing image for first text: ${session.id}`)
        const { error: stashErr } = await supabaseAdmin
          .from('sessions')
          .update({
            pending_whatsapp_media_id: mediaId,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', session.id)

        if (stashErr) {
          console.error('❌ Failed to stash pending WhatsApp image on session:', stashErr)
        } else {
          try {
            await sendWa(waRecipient, 'image_stashed', residentWhatsAppCreds)
          } catch (sendError) {
            console.error('⚠️ Failed to send image-before-text guidance:', sendError)
          }
        }

        return
      }

      // Case B: No session/ticket context - attach to most recent ticket for this phone (short window)
      const recentTicket = await findRecentTicketForPhone(from, supabaseAdmin, webhookClientId)
      if (recentTicket && recentTicket.status !== 'CLOSED') {
        const ticketId = recentTicket.id
        let failureReason = ''

        console.log(`📍 No active session. Found recent ticket for ${from} - attaching image to ticket: ${ticketId}`)

        console.log(`⏳ PIPELINE_STEP: 1/4 Downloading image from WhatsApp (mediaId: ${mediaId})`)
        const mediaData = await downloadWhatsAppMedia(mediaId, 'image')

        if (!mediaData) {
          failureReason = 'DOWNLOAD_FAILED'
        } else {
          console.log(`⏳ PIPELINE_STEP: 2/4 Uploading to Supabase Storage`)
          const uploadResult = await uploadWhatsAppMediaToStorage(
            ticketId,
            mediaData.buffer,
            mediaData.fileName,
            mediaData.mimeType
          )

          if (uploadResult) {
            console.log(`⏳ PIPELINE_STEP: 3/4 Creating attachment database record`)
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
              console.log(`⏳ PIPELINE_STEP: 4/4 Sending WhatsApp confirmation`)
              try {
                await sendWa(waRecipient, 'image_attached', residentWhatsAppCreds)
              } catch (sendError) {
                console.error('⚠️ PIPELINE_WARNING: Failed to send confirmation (recent ticket attach)', sendError)
              }

              await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'recent_ticket_image_processed_success')

              return
            } else {
              failureReason = 'DB_INSERT_FAILED'
            }
          } else {
            failureReason = 'STORAGE_UPLOAD_FAILED'
          }
        }

        console.log(`📤 PIPELINE_FALLBACK: recent-ticket attach failed`, { failureReason, ticketId })
        try {
          await sendWa(waRecipient, 'image_failed', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send recent-ticket fallback message:', sendError)
        }

        await resetSessionCompletely(from, supabaseAdmin, webhookClientId, 'recent_ticket_image_processed_failure')

        return
      }

      // Case C: No context and no recent ticket - guide user to start flow
      console.log('📍 Image received but no session context and no recent ticket - guiding user to start')

      try {
        await sendWa(waRecipient, 'welcome', residentWhatsAppCreds)
      } catch (sendError) {
        console.error('⚠️ Failed to send image-context-needed message:', sendError)
      }

      return
    }

    if (!textBody) {
      if (messageType === 'reaction') {
        try {
          await sendWa(waRecipient, 'redirect_to_text', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send reaction reply:', sendError)
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
        } catch (sendError) {
          console.error('⚠️ Failed unknown-type reply:', sendError)
        }
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
          if (row.status === 'IN_PROGRESS' && w?.full_name) {
            s += ` עובד ${w.full_name} מטפל.`
          }
          return s
        }) ?? []

      try {
        if (lines.length > 0) {
          await sendWhatsAppTextMessage(waRecipient, lines.join('\n'), residentWhatsAppCreds, { clientId: webhookClientId })
        } else {
          await sendWa(waRecipient, 'no_open_tickets', residentWhatsAppCreds)
        }
      } catch (sendError) {
        console.error('⚠️ Failed to send status reply:', sendError)
      }

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
        } catch (sendError) {
          console.error('⚠️ Failed to send invalid-start-code reply:', sendError)
        }

        return
      }

      const { projectCode, buildingNumber } = parsedStart

      console.log('🚀 Start flow detected for project code:', projectCode)
      console.log('🏢 Building number:', buildingNumber || 'none')

      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, name, project_code')
        .eq('project_code', projectCode)
        .eq('client_id', webhookClientId)
        .maybeSingle()

      if (projectError) {
        console.error('❌ Error fetching project:', projectError)
        return
      }

      if (!project) {
        console.log('⚠️ No project found for code:', projectCode)

        try {
          await sendWa(waRecipient, 'project_not_found', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send project-not-found reply:', sendError)
        }

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
        console.error('❌ Error deactivating old sessions:', deactivateError)
        return
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
        console.error('❌ Error creating session:', sessionInsertError)
        return
      }

      console.log('✅ Session created:', createdSession.id)
      console.log('🏗️ Project linked:', project.name)

      if (!isTestWhatsAppSender) {
        await getOrCreateResident(supabaseAdmin, webhookClientId, from, project.id)
      }

      try {
        const buildingLine = buildingNumber ? ` (בניין ${buildingNumber})` : ''

        await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
          project_name: project.name,
          building_line: buildingLine,
        })
      } catch (sendError) {
        console.error('⚠️ Failed to send start-flow reply:', sendError)
      }

      return
    }

    let ticketPriority = resolveTicketPriorityFromResidentMessage(textBody)

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
            try {
              await sendWa(waRecipient, 'resident_prompt', residentWhatsAppCreds)
            } catch (sendError) {
              console.error('⚠️ Failed to send resident-memory prompt:', sendError)
            }
            return
          }
        }
      }
    }

    if (!session) {
      logWhatsAppRuntimePath('NO_SESSION_PATH_ENTERED', {
        textBody,
        phone_number: from,
        session: null,
      })

      // STEP 2.5: PENDING SELECTION HANDLING (user replies with number 1/2/3)
      const numericSelection = isNumericSelection(textBody)
      let pendingSelection = await getPendingSelection(from, supabaseAdmin, webhookClientId)

      if (numericSelection && pendingSelection) {
        // User selected a valid number and pending selection exists
        console.log(`✅ User selected option: ${numericSelection}`)

        const candidates = pendingSelection.candidate_projects || []
        const selectedIndex = numericSelection - 1

        if (selectedIndex >= 0 && selectedIndex < candidates.length) {
          const selectedProject = candidates[selectedIndex]
          console.log('✅ Creating session for selected building:', selectedProject.name)

          // Ensure only one active session per phone_number
          await supabaseAdmin
            .from('sessions')
            .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
            .eq('phone_number', from)
            .eq('client_id', webhookClientId)
            .eq('is_active', true)

          const { data: createdSession, error: sessionCreateError } = await supabaseAdmin
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
            console.error('❌ Error creating session from selection:', sessionCreateError)
            return
          }

          // Clear pending selection
          await clearPendingSelection(from, supabaseAdmin, webhookClientId)

          if (!isTestWhatsAppSender) {
            await getOrCreateResident(supabaseAdmin, webhookClientId, from, selectedProject.id)
          }

          // Send confirmation
          try {
            await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
              project_name: selectedProject.name,
            })
          } catch (sendError) {
            console.error('⚠️ Failed to send selection confirmation:', sendError)
          }

          return
        }
      }

      // INVALID NUMERIC SELECTION (number outside range while pending exists)
      if (numericSelection && pendingSelection) {
        console.log(`⚠️ Invalid selection (out of range): ${numericSelection}`)

        try {
          await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send invalid-selection message:', sendError)
        }

        return
      }

      // Pending selection + non-numeric: either refine search (address-like) or remind to pick 1/2/3
      if (pendingSelection && !numericSelection) {
        if (isAddressLikeText(textBody)) {
          console.log('ℹ️ Pending selection cleared — user sent a new address-like query; re-searching')
          await clearPendingSelection(from, supabaseAdmin, webhookClientId)
          pendingSelection = null
        } else {
          console.log('⚠️ Pending selection exists but message is not numeric')

          try {
            await sendWa(waRecipient, 'selection_invalid', residentWhatsAppCreds)
          } catch (sendError) {
            console.error('⚠️ Failed to send pending-reminder message:', sendError)
          }

          return
        }
      }

      const addressLike = isAddressLikeText(textBody)
      logWhatsAppRuntimePath('TEXT_ADDRESS_LIKE_RESULT', {
        textBody,
        phone_number: from,
        session: null,
      })
      console.log('TEXT_ADDRESS_LIKE_RESULT_VALUE', { textBody, phone_number: from, addressLike })

      if (!addressLike) {
        console.log('ℹ️ Free-text does not look address-like; sending guidance instead of searching:', textBody)

        try {
          await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send no-match message:', sendError)
        }

        logWhatsAppRuntimePath('GUIDANCE_FALLBACK_RETURNED', {
          textBody,
          phone_number: from,
          session: null,
        })

        return
      }

      console.log('ℹ️ Address-like text detected; attempting building search...')

      logWhatsAppRuntimePath('SEARCH_PROJECTS_CALLED', {
        textBody,
        phone_number: from,
        session: null,
      })

      const searchResults = await searchProjectsByBuilding(textBody, supabaseAdmin, webhookClientId)

      if (searchResults.length === 0) {
        // No matches found - send safe error message
        console.log('❌ No building matches found for search:', textBody)

        try {
          await sendWa(waRecipient, 'building_not_found', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send no-match message:', sendError)
        }

        return
      }

      if (searchResults.length === 1) {
        // Exactly 1 match - auto-create session
        const matchedProject = searchResults[0]
        console.log('✅ Found 1 matching building:', matchedProject.name)

        // Ensure only one active session per phone_number
        await supabaseAdmin
          .from('sessions')
          .update({ is_active: false, active_ticket_id: null, last_activity_at: new Date().toISOString() })
          .eq('phone_number', from)
          .eq('client_id', webhookClientId)
          .eq('is_active', true)

        const { data: createdSession, error: sessionCreateError } = await supabaseAdmin
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
          console.error('❌ Error creating session from search match:', sessionCreateError)
          return
        }

        if (!isTestWhatsAppSender) {
          await getOrCreateResident(supabaseAdmin, webhookClientId, from, matchedProject.id)
        }

        // Send confirmation message with project name
        try {
          await sendWa(waRecipient, 'session_created', residentWhatsAppCreds, {
            project_name: matchedProject.name,
          })
        } catch (sendError) {
          console.error('⚠️ Failed to send search-match confirmation:', sendError)
        }

        return
      }

      // Multiple matches (2-3) - store pending selection and send numbered list
      console.log(`⚠️ Found ${searchResults.length} matching buildings`)

      // Create pending selection state
      const pendingCreated = await createPendingSelection(
        from,
        searchResults,
        supabaseAdmin,
        webhookClientId
      )

      if (!pendingCreated) {
        console.error('⚠️ Failed to create pending selection, sending fallback message')

        try {
          await sendWa(waRecipient, 'technical_error', residentWhatsAppCreds)
        } catch (sendError) {
          console.error('⚠️ Failed to send error message:', sendError)
        }

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
      } catch (sendError) {
        console.error('⚠️ Failed to send multi-match list:', sendError)
      }

      return
    }

    logWhatsAppRuntimePath('TICKET_CREATE_PATH_ENTERED', {
      textBody,
      phone_number: from,
      session,
    })

    // Product rule: never keep active_ticket_id for text follow-ups.
    // Session is only used to bridge: (project identified) -> (ticket description) -> ticket created.

    if (session.project_id) {
      const dupTicket = await findOpenTicketForReporterInWindow(from, webhookClientId, 5, supabaseAdmin)
      if (dupTicket) {
        await supabaseAdmin
          .from('sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', session.id)
        try {
          await sendWa(
            waRecipient,
            'duplicate_ticket',
            residentWhatsAppCreds,
            { ticket_number: String(dupTicket.ticket_number) }
          )
        } catch (sendError) {
          console.error('⚠️ Failed to send duplicate-ticket reply:', sendError)
        }
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
      console.error('⚠️ Failed to fetch project for building extraction:', existingProjectError)
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
      console.error('❌ Error creating ticket:', ticketError)
      return
    }

    const pendingImageAttached = await attachPendingWhatsAppImageToTicketIfAny(
      from,
      webhookClientId,
      createdTicket.id,
      supabaseAdmin
    )
    if (pendingImageAttached) {
      console.log('✅ Pending WhatsApp image attached to new ticket', { ticketId: createdTicket.id })
    }

    const pendingLocationAttached = await attachPendingSessionLocationToTicketIfAny(
      from,
      webhookClientId,
      createdTicket.id,
      supabaseAdmin
    )
    if (pendingLocationAttached) {
      console.log('✅ Pending WhatsApp location merged into new ticket', { ticketId: createdTicket.id })
    }

    const pendingForApproval =
      !!session.project_id &&
      (await queuePendingResidentApproval({
        supabase: supabaseAdmin,
        clientId: webhookClientId,
        projectId: session.project_id as string,
        ticketId: createdTicket.id,
        waFrom: waRecipient,
      }))

    // Immediately reset session after ticket creation confirmation is sent (single-purpose session).

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
      console.error('⚠️ Ticket log insert failed (non-blocking):', logError)
    }

    console.log('✅ Ticket created:', createdTicket.ticket_number)

    try {
      const { data: projectForNotification, error: projectNotificationError } = await supabaseAdmin
        .from('projects')
        .select('name, manager_phone, assigned_worker_id')
        .eq('id', session.project_id)
        .eq('client_id', webhookClientId)
        .single()

      if (projectNotificationError) {
        console.error('⚠️ Failed to fetch project manager phone:', projectNotificationError)
      } else if (projectForNotification) {
        const buildingLine = buildingNumber ? `בניין: ${buildingNumber}\n` : ''
        const smsMessage = `נפתחה תקלה חדשה\nפרויקט: ${projectForNotification.name}\n${buildingLine}תקלה: #${createdTicket.ticket_number}\nתיאור: ${ticketDescription || 'ללא פירוט'}\nמדווח: ${displayReporterForExternalMessage(waRecipient)}\nכניסה למערכת:\n${getPublicTicketsUrl()}\n${clientName}`

        const managerDestination = clientManagerPhone || projectForNotification.manager_phone || getManagerPhoneFromEnv()

        if (managerDestination) {
          console.log('📱 NOTIFICATION_CHANNEL: SMS (new ticket) → manager')
          const smsSent = await sendManagerSMS(managerDestination, smsMessage, smsSenderName, webhookClientId)
          if (smsSent) {
            console.log('✅ manager_sms_sent: Manager notification sent successfully via SMS')
          } else {
            console.error('❌ manager_sms_failed: Failed to send SMS to manager')
          }
        }

        if (projectForNotification.assigned_worker_id) {
          const { data: workerRow } = await supabaseAdmin
            .from('workers')
            .select('phone, full_name')
            .eq('id', projectForNotification.assigned_worker_id)
            .eq('client_id', webhookClientId)
            .is('deleted_at', null)
            .maybeSingle()

          if (workerRow?.phone) {
            const workerMsg = `תקלה חדשה ב${projectForNotification.name}\n#${createdTicket.ticket_number}\n${ticketDescription || 'ללא פירוט'}\nמדווח: ${displayReporterForExternalMessage(waRecipient)}\n${getPublicTicketsUrl()}\n${clientName}`
            console.log('📱 NOTIFICATION_CHANNEL: SMS (new ticket) → assigned worker')
            const wOk = await sendWorkerSMS(workerRow.phone, workerMsg, smsSenderName, webhookClientId)
            if (wOk) {
              console.log('✅ worker_sms_sent: Assigned worker notified')
            } else {
              console.error('❌ worker_sms_failed')
            }
          }
        }
      }
    } catch (notifyManagerError) {
      console.error('⚠️ manager_notification_failed: Error notifying manager:', notifyManagerError)
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
    } catch (sendError) {
      console.error('⚠️ Failed to send ticket-created reply:', sendError)
    }

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
  webhookJsonLogger.info('whatsapp-webhook-request', { requestId })

  try {
    const rawBody = await req.text()
    const metaSecret = (process.env.WHATSAPP_APP_SECRET || '').trim()
    const sigHdr = req.headers.get('x-hub-signature-256')

    if (metaSecret && !verifyWhatsAppWebhookSignature(rawBody, sigHdr, metaSecret)) {
      webhookJsonLogger.error(
        'whatsapp-webhook-invalid-signature',
        new Error('meta_signature_mismatch'),
        { requestId }
      )
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
      webhookJsonLogger.error('whatsapp-webhook-supabase-env', envError, { requestId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    if (process.env.NODE_ENV !== 'production') {
      webhookJsonLogger.info('whatsapp-webhook-payload-summary', {
        requestId,
        bytes: rawBody.length,
        hasEntry: Array.isArray((body as { entry?: unknown }).entry),
      })
      logger.debug('WEBHOOK', 'Full webhook payload (dev only)', { requestId, payload: body })
    } else {
      logger.debug('WEBHOOK', 'Webhook payload received', {
        requestId,
        hasEntry: Array.isArray((body as { entry?: unknown }).entry),
      })
    }

    const parsedMessage = parseIncomingWhatsAppMessage(body)

    if (!parsedMessage) {
      webhookJsonLogger.info('whatsapp-webhook-no-user-message', { requestId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const phoneNumberId = extractWhatsAppPhoneNumberId(body)
    if (!phoneNumberId) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const waRl = await checkWhatsAppWebhookPhoneRateLimit(supabaseAdmin, phoneNumberId)
    if (waRl.isLimited) {
      webhookJsonLogger.info('whatsapp-webhook-phone-rate-limited', { requestId, phoneNumberId })
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
      webhookJsonLogger.error(
        'whatsapp-webhook-unknown-phone-number-id',
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
      webhookJsonLogger.info('whatsapp-webhook-duplicate', { requestId, dedupeMessageId })
      return NextResponse.json({ received: true }, { status: 200 })
    }
    if (dupErr) {
      webhookJsonLogger.error('whatsapp-webhooks-dedupe-insert', dupErr, { requestId, dedupeMessageId })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const tenantPayload: WaWebhookTenant = {
      clientId: tenantResolved.clientId,
      row: tenantResolved.row,
    }

    after(() => {
      void runWhatsAppInboundBackground(
        body,
        requestId,
        parsedMessage,
        supabaseAdmin,
        tenantPayload
      ).catch((err) => {
        logger.error(
          'WEBHOOK',
          'Background inbound failed',
          err instanceof Error ? err : new Error(String(err)),
          { requestId }
        )
        webhookJsonLogger.error('whatsapp-webhook-background-error', err, { requestId })
      })
    })
    return NextResponse.json({ received: true, status: 'ok' }, { status: 200 })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('WEBHOOK', 'WhatsApp webhook POST error', err, { requestId })
    webhookJsonLogger.error('whatsapp-webhook-post-unhandled', err, { requestId })
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

