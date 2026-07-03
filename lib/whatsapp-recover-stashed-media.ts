import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { whatsAppConversationPhoneKey } from '@/lib/whatsapp-message-store'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { parseWhatsAppMessageMediaPayload } from '@/lib/whatsapp-message-media'
import {
  readStashedPreSessionMedia,
  isStashedMediaRow,
} from '@/lib/whatsapp-webhook/building-search-stash'
import { getPendingSelection } from '@/lib/whatsapp-webhook/project-selection'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

type WaMediaKind = 'image' | 'video'

export type RecoverMediaResult = {
  recovered: boolean
  reason?: string
  method?: 'session_stash' | 'storage_orphan' | 'message_log' | 'pending_stash'
  sessions_tried?: number
  storage_files_linked?: number
  attachments_added?: number
}

/** All phone keys that may appear in sessions vs tickets for the same resident. */
export function reporterPhoneLookupKeys(raw: string): string[] {
  const keys = new Set<string>()
  const trimmed = raw.trim()
  if (!trimmed) return []

  keys.add(trimmed)
  const normalized = normalizePhone(trimmed)
  if (normalized) {
    keys.add(normalized)
    if (normalized.startsWith('972') && normalized.length >= 11) {
      keys.add(`0${normalized.slice(3)}`)
      keys.add(`+${normalized}`)
    }
  }
  return [...keys]
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase service credentials')
  return createClient(url, key)
}

function guessMimeFromFileName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  return 'application/octet-stream'
}

type StashedSession = {
  id: string
  pending_whatsapp_media_id: string
  pending_whatsapp_media_type: string | null
}

async function listStashedSessions(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  phoneKeys: string[]
): Promise<StashedSession[]> {
  if (phoneKeys.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, pending_whatsapp_media_id, pending_whatsapp_media_type, last_activity_at')
    .eq('client_id', clientId)
    .in('phone_number', phoneKeys)
    .not('pending_whatsapp_media_id', 'is', null)
    .order('last_activity_at', { ascending: false })
    .limit(20)

  if (error) {
    logger.warn('WA_RECOVER', 'list stashed sessions failed', { err: error.message })
    return []
  }

  return (data ?? [])
    .filter((row) => typeof row.pending_whatsapp_media_id === 'string' && row.pending_whatsapp_media_id.length > 0)
    .map((row) => ({
      id: row.id as string,
      pending_whatsapp_media_id: row.pending_whatsapp_media_id as string,
      pending_whatsapp_media_type: (row.pending_whatsapp_media_type as string | null) ?? null,
    }))
}

async function listAttachedWhatsAppMediaIds(
  supabaseAdmin: SupabaseClient,
  ticketId: string
): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('ticket_attachments')
    .select('whatsapp_media_id')
    .eq('ticket_id', ticketId)

  return new Set(
    (data ?? [])
      .map((row) => (row.whatsapp_media_id as string | null)?.trim())
      .filter((id): id is string => !!id)
  )
}

async function attachMediaIdToTicket(
  supabaseAdmin: SupabaseClient,
  ticketId: string,
  mediaId: string,
  mediaKind: WaMediaKind,
  accessToken: string,
  attachmentType: string,
  attachedIds: Set<string>
): Promise<boolean> {
  if (attachedIds.has(mediaId)) return false

  const mediaData = await downloadWhatsAppMedia(mediaId, mediaKind, accessToken)
  if (!mediaData) return false

  const uploadResult = await uploadWhatsAppMediaToStorage(
    ticketId,
    mediaData.buffer,
    mediaData.fileName,
    mediaData.mimeType
  )
  if (!uploadResult) return false

  const ok = await createAttachmentRecord(
    supabaseAdmin,
    ticketId,
    mediaData.fileName,
    uploadResult.filePath,
    uploadResult.fileSize,
    mediaData.mimeType,
    mediaId,
    attachmentType
  )
  if (ok) attachedIds.add(mediaId)
  return ok
}

async function clearSessionStash(supabaseAdmin: SupabaseClient, sessionId: string) {
  await supabaseAdmin
    .from('sessions')
    .update({
      pending_whatsapp_media_id: null,
      pending_whatsapp_media_type: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}

/** Link storage files under ticket-attachments/{ticketId}/ missing from ticket_attachments. */
export async function recoverStorageOrphansForTicket(
  supabaseAdmin: SupabaseClient,
  ticketId: string
): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('ticket_attachments')
    .select('file_url')
    .eq('ticket_id', ticketId)

  const existingPaths = new Set((existing ?? []).map((r) => r.file_url as string))

  let storage
  try {
    storage = getServiceSupabase().storage
  } catch {
    return 0
  }

  const { data: files, error } = await storage.from('ticket-attachments').list(ticketId, { limit: 100 })
  if (error || !files?.length) return 0

  let linked = 0
  for (const file of files) {
    const name = file.name
    if (!name || name.startsWith('.')) continue
    const filePath = `${ticketId}/${name}`
    if (existingPaths.has(filePath)) continue

    const mime = guessMimeFromFileName(name)
    const attachmentType = mime.startsWith('video/') ? 'whatsapp_video' : 'whatsapp_image'
    const ok = await createAttachmentRecord(
      supabaseAdmin,
      ticketId,
      name,
      filePath,
      file.metadata?.size ?? 0,
      mime,
      undefined,
      attachmentType
    )
    if (ok) {
      linked++
      existingPaths.add(filePath)
    }
  }

  if (linked > 0) {
    logger.info('WA_RECOVER', 'linked storage orphan files to ticket', { ticketId, linked })
  }
  return linked
}

async function recoverFromStashedSessions(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhoneRaw: string,
  accessToken: string,
  attachedIds: Set<string>
): Promise<{ added: number; sessions_tried: number; reason?: string }> {
  const phoneKeys = reporterPhoneLookupKeys(reporterPhoneRaw)
  const sessions = await listStashedSessions(supabaseAdmin, clientId, phoneKeys)

  if (sessions.length === 0) {
    return { added: 0, sessions_tried: 0, reason: 'NO_STASHED_MEDIA' }
  }

  let added = 0
  for (const session of sessions) {
    const mediaKind: WaMediaKind = session.pending_whatsapp_media_type === 'video' ? 'video' : 'image'
    const attachmentType = mediaKind === 'video' ? 'whatsapp_video' : 'whatsapp_image'

    const ok = await attachMediaIdToTicket(
      supabaseAdmin,
      ticketId,
      session.pending_whatsapp_media_id,
      mediaKind,
      accessToken,
      attachmentType,
      attachedIds
    )

    if (ok) {
      await clearSessionStash(supabaseAdmin, session.id)
      added++
      logger.info('WA_RECOVER', 'stashed media recovered to ticket', { ticketId, mediaKind, sessionId: session.id })
    }
  }

  if (added > 0) return { added, sessions_tried: sessions.length }
  return { added: 0, sessions_tried: sessions.length, reason: 'ATTACH_FAILED' }
}

async function recoverFromPendingSelectionStash(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhoneRaw: string,
  accessToken: string,
  attachedIds: Set<string>
): Promise<number> {
  const phoneKeys = reporterPhoneLookupKeys(reporterPhoneRaw)
  let added = 0

  for (const phone of phoneKeys) {
    const media = await readStashedPreSessionMedia(phone, supabaseAdmin, clientId)
    if (!media) continue

    const attachmentType = media.mediaKind === 'video' ? 'whatsapp_video' : 'whatsapp_image'
    const ok = await attachMediaIdToTicket(
      supabaseAdmin,
      ticketId,
      media.mediaId,
      media.mediaKind,
      accessToken,
      attachmentType,
      attachedIds
    )
    if (ok) {
      added++
      const pending = await getPendingSelection(phone, supabaseAdmin, clientId)
      if (pending) {
        const withoutMedia = (pending.candidate_projects || []).filter((p) => !isStashedMediaRow(p))
        if (withoutMedia.length === 0) {
          await supabaseAdmin.from('pending_selections').delete().eq('id', pending.id)
        }
      }
    }
  }

  return added
}

/** Inbound media sent shortly before/after ticket open belongs to that ticket. */
export function isWhatsAppMessageInTicketMediaWindow(
  messageCreatedAt: string,
  ticketCreatedAt: string,
  opts?: { beforeMs?: number; afterMs?: number }
): boolean {
  const msgMs = new Date(messageCreatedAt).getTime()
  const ticketMs = new Date(ticketCreatedAt).getTime()
  if (!Number.isFinite(msgMs) || !Number.isFinite(ticketMs)) return false
  const beforeMs = opts?.beforeMs ?? 2 * 60 * 60 * 1000
  const afterMs = opts?.afterMs ?? 30 * 60 * 1000
  return msgMs >= ticketMs - beforeMs && msgMs <= ticketMs + afterMs
}

async function recoverFromWhatsAppMessageLog(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhoneRaw: string,
  accessToken: string,
  attachedIds: Set<string>
): Promise<number> {
  const { data: ticket } = await supabaseAdmin
    .from('tickets')
    .select('created_at')
    .eq('id', ticketId)
    .maybeSingle()

  const ticketCreatedAt = (ticket as { created_at?: string } | null)?.created_at ?? null

  const phoneKey = whatsAppConversationPhoneKey(reporterPhoneRaw)
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id')
    .eq('client_id', clientId)
    .eq('phone', phoneKey)
    .maybeSingle()

  if (!conv?.id) return 0

  const { data: messages } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('message_type, interactive_payload, direction, created_at, ticket_id')
    .eq('client_id', clientId)
    .eq('conversation_id', conv.id)
    .eq('direction', 'in')
    .in('message_type', ['image', 'video'])
    .order('created_at', { ascending: true })

  let added = 0
  for (const row of messages ?? []) {
    if (row.ticket_id && row.ticket_id !== ticketId) continue
    if (
      ticketCreatedAt &&
      row.created_at &&
      !isWhatsAppMessageInTicketMediaWindow(row.created_at as string, ticketCreatedAt)
    ) {
      continue
    }
    const messageType = row.message_type as string
    const ref = parseWhatsAppMessageMediaPayload(
      row.interactive_payload as Record<string, unknown> | null
    )
    if (!ref) continue

    const mediaKind: WaMediaKind =
      ref.kind === 'video' || messageType === 'video' ? 'video' : 'image'
    const attachmentType = mediaKind === 'video' ? 'whatsapp_video' : 'whatsapp_image'
    const ok = await attachMediaIdToTicket(
      supabaseAdmin,
      ticketId,
      ref.mediaId,
      mediaKind,
      accessToken,
      attachmentType,
      attachedIds
    )
    if (ok) {
      added++
      logger.info('WA_RECOVER', 'message-log media recovered to ticket', {
        ticketId,
        mediaKind,
        mediaId: ref.mediaId,
      })
    }
  }

  return added
}

/**
 * Full recovery: storage orphans, session stash, pending stash, then WhatsApp message log.
 * Keeps trying when some attachments exist but video/image from the thread is still missing.
 */
export async function recoverAllWhatsAppMediaForTicket(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhoneRaw: string,
  accessToken?: string
): Promise<RecoverMediaResult> {
  const attachedIds = await listAttachedWhatsAppMediaIds(supabaseAdmin, ticketId)
  const hadAttachments = attachedIds.size > 0
  let attachmentsAdded = 0

  const storageLinked = await recoverStorageOrphansForTicket(supabaseAdmin, ticketId)
  if (storageLinked > 0) {
    attachmentsAdded += storageLinked
    const refreshed = await listAttachedWhatsAppMediaIds(supabaseAdmin, ticketId)
    refreshed.forEach((id) => attachedIds.add(id))
  }

  if (!accessToken?.trim()) {
    if (attachmentsAdded > 0) {
      return {
        recovered: true,
        method: 'storage_orphan',
        storage_files_linked: storageLinked,
        attachments_added: attachmentsAdded,
      }
    }
    return { recovered: false, reason: 'MISSING_ACCESS_TOKEN', storage_files_linked: storageLinked }
  }

  const stashResult = await recoverFromStashedSessions(
    supabaseAdmin,
    clientId,
    ticketId,
    reporterPhoneRaw,
    accessToken,
    attachedIds
  )
  attachmentsAdded += stashResult.added

  const pendingAdded = await recoverFromPendingSelectionStash(
    supabaseAdmin,
    clientId,
    ticketId,
    reporterPhoneRaw,
    accessToken,
    attachedIds
  )
  attachmentsAdded += pendingAdded

  const logAdded = await recoverFromWhatsAppMessageLog(
    supabaseAdmin,
    clientId,
    ticketId,
    reporterPhoneRaw,
    accessToken,
    attachedIds
  )
  attachmentsAdded += logAdded

  if (attachmentsAdded > 0) {
    return {
      recovered: true,
      method: logAdded > 0 ? 'message_log' : pendingAdded > 0 ? 'pending_stash' : stashResult.added > 0 ? 'session_stash' : 'storage_orphan',
      sessions_tried: stashResult.sessions_tried,
      storage_files_linked: storageLinked,
      attachments_added: attachmentsAdded,
    }
  }

  if (hadAttachments) {
    return {
      recovered: false,
      reason: 'NOT_FOUND',
      sessions_tried: stashResult.sessions_tried,
      storage_files_linked: storageLinked,
    }
  }

  return {
    recovered: false,
    reason: stashResult.reason ?? 'NOT_FOUND',
    sessions_tried: stashResult.sessions_tried,
    storage_files_linked: storageLinked,
  }
}

/** @deprecated Use recoverAllWhatsAppMediaForTicket */
export async function recoverStashedWhatsAppMediaToTicket(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhone: string,
  accessToken?: string
): Promise<{ recovered: boolean; reason?: string }> {
  const result = await recoverAllWhatsAppMediaForTicket(
    supabaseAdmin,
    clientId,
    ticketId,
    reporterPhone,
    accessToken
  )
  return { recovered: result.recovered, reason: result.reason }
}
