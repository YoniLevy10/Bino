import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'
import {
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToStorage,
  createAttachmentRecord,
} from '@/lib/whatsapp-media'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

type WaMediaKind = 'image' | 'video'

export type RecoverMediaResult = {
  recovered: boolean
  reason?: string
  method?: 'session_stash' | 'storage_orphan'
  sessions_tried?: number
  storage_files_linked?: number
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
  accessToken: string
): Promise<RecoverMediaResult> {
  const phoneKeys = reporterPhoneLookupKeys(reporterPhoneRaw)
  const sessions = await listStashedSessions(supabaseAdmin, clientId, phoneKeys)

  if (sessions.length === 0) {
    return { recovered: false, reason: 'NO_STASHED_MEDIA', sessions_tried: 0 }
  }

  for (const session of sessions) {
    const mediaKind: WaMediaKind = session.pending_whatsapp_media_type === 'video' ? 'video' : 'image'
    const attachmentType = mediaKind === 'video' ? 'whatsapp_video' : 'whatsapp_image'

    const ok = await attachMediaIdToTicket(
      supabaseAdmin,
      ticketId,
      session.pending_whatsapp_media_id,
      mediaKind,
      accessToken,
      attachmentType
    )

    if (ok) {
      await clearSessionStash(supabaseAdmin, session.id)
      logger.info('WA_RECOVER', 'stashed media recovered to ticket', { ticketId, mediaKind, sessionId: session.id })
      return { recovered: true, method: 'session_stash', sessions_tried: sessions.length }
    }
  }

  return {
    recovered: false,
    reason: 'ATTACH_FAILED',
    sessions_tried: sessions.length,
  }
}

/**
 * Full recovery: stashed WhatsApp session media (Meta download) then storage orphans.
 * Does not require the resident to resend if media id or file still exists.
 */
export async function recoverAllWhatsAppMediaForTicket(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  reporterPhoneRaw: string,
  accessToken?: string
): Promise<RecoverMediaResult> {
  const { count: existingCount } = await supabaseAdmin
    .from('ticket_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)

  if ((existingCount ?? 0) > 0) {
    return { recovered: true, method: 'session_stash', reason: 'ALREADY_HAS_ATTACHMENTS' }
  }

  const storageLinked = await recoverStorageOrphansForTicket(supabaseAdmin, ticketId)
  if (storageLinked > 0) {
    return {
      recovered: true,
      method: 'storage_orphan',
      storage_files_linked: storageLinked,
    }
  }

  if (!accessToken?.trim()) {
    return { recovered: false, reason: 'MISSING_ACCESS_TOKEN', storage_files_linked: 0 }
  }

  const stashResult = await recoverFromStashedSessions(
    supabaseAdmin,
    clientId,
    ticketId,
    reporterPhoneRaw,
    accessToken
  )

  if (stashResult.recovered) return stashResult

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
