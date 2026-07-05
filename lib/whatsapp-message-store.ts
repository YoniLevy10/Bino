import type { SupabaseClient } from '@supabase/supabase-js'
import { findResidentByPhoneClient, normalizePhone } from '@/lib/residents-whatsapp'

/** Canonical phone key for whatsapp_conversations — preserves wa_test_* keys. */
export function whatsAppConversationPhoneKey(phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.startsWith('wa_test_')) return trimmed
  return normalizePhone(trimmed)
}

async function findConversationIdByPhone(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<string | null> {
  const canonical = whatsAppConversationPhoneKey(phone)
  const keysToTry = canonical === phone.trim() ? [canonical] : [canonical, phone.trim()]
  for (const key of keysToTry) {
    if (!key) continue
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id')
      .eq('client_id', clientId)
      .eq('phone', key)
      .maybeSingle()
    if (conv?.id) return conv.id as string
  }
  return null
}

export type WhatsAppThreadLoadResult = {
  conversation_id: string | null
  messages: Awaited<ReturnType<typeof listWhatsAppMessagesForConversation>>
}
import {
  hasDisplayableResidentJoin,
  isDisplayableResidentName,
  pickInboxResidentByPhone,
  residentSummaryFromJoin,
  type InboxResidentSummary,
  type ResidentJoinSummary,
} from '@/lib/whatsapp-inbox-display'

import { mergeWhatsAppInteractivePayload } from '@/lib/whatsapp-message-media'

export type WhatsAppMessageDirection = 'in' | 'out'

export type PersistWhatsAppMessageInput = {
  clientId: string
  phone: string
  direction: WhatsAppMessageDirection
  body?: string | null
  messageType?: string
  waMessageId?: string | null
  interactivePayload?: Record<string, unknown> | null
  ticketId?: string | null
  residentId?: string | null
  whatsappMediaId?: string | null
  whatsappMediaKind?: 'image' | 'video' | null
}

function previewText(body: string | null | undefined, max = 120): string | null {
  if (!body) return null
  const t = body.trim()
  if (!t) return null
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function extractMetaWaMessageId(response: Record<string, unknown> | null): string | null {
  if (!response) return null
  const messages = (response as { messages?: Array<{ id?: string }> }).messages
  const id = messages?.[0]?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Upsert conversation row and insert message. Best-effort — never throws to caller. */
export async function persistWhatsAppMessage(
  admin: SupabaseClient,
  input: PersistWhatsAppMessageInput
): Promise<{ conversationId: string; messageId: string } | null> {
  try {
    const now = new Date().toISOString()
    const storagePhone = whatsAppConversationPhoneKey(input.phone)
    let residentId = input.residentId ?? null
    if (!residentId) {
      const resident = await findResidentByPhoneClient(admin, input.clientId, storagePhone)
      if (resident && isDisplayableResidentName(resident.full_name)) {
        residentId = resident.id
      }
    }

    const { data: conv, error: convErr } = await admin
      .from('whatsapp_conversations')
      .upsert(
        {
          client_id: input.clientId,
          phone: storagePhone,
          resident_id: residentId,
          last_message_at: now,
          last_message_preview: previewText(input.body),
          updated_at: now,
        },
        { onConflict: 'client_id,phone' }
      )
      .select('id')
      .single()

    if (convErr || !conv?.id) {
      return null
    }

    const interactivePayload = mergeWhatsAppInteractivePayload(
      input.interactivePayload,
      input.whatsappMediaId,
      input.whatsappMediaKind
    )

    const { data: msg, error: msgErr } = await admin
      .from('whatsapp_messages')
      .insert({
        conversation_id: conv.id,
        client_id: input.clientId,
        direction: input.direction,
        wa_message_id: input.waMessageId ?? null,
        body: input.body ?? null,
        message_type: input.messageType ?? 'text',
        interactive_payload: interactivePayload,
        ticket_id: input.ticketId ?? null,
        status: 'sent',
        created_at: now,
      })
      .select('id')
      .single()

    if (msgErr || !msg?.id) return null
    return { conversationId: conv.id as string, messageId: msg.id as string }
  } catch {
    return null
  }
}

export async function listWhatsAppConversations(
  admin: SupabaseClient,
  clientId: string,
  limit = 50
) {
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .select('id, phone, resident_id, last_message_at, last_message_preview, residents(full_name, apartment_number)')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  const rows = data ?? []

  const phonesNeedingLookup = rows
    .filter((row) => !hasDisplayableResidentJoin((row as { residents?: ResidentJoinSummary }).residents))
    .map((row) => (row as { phone: string }).phone)

  const normalizedSet = [...new Set(phonesNeedingLookup.map((p) => normalizePhone(p)).filter(Boolean))]
  let residentsByPhone: InboxResidentSummary[] = []

  if (normalizedSet.length > 0) {
    const { data: residentRows, error: residentErr } = await admin
      .from('residents')
      .select('id, full_name, apartment_number, normalized_phone')
      .eq('client_id', clientId)
      .in('normalized_phone', normalizedSet)
      .is('deleted_at', null)

    if (residentErr) throw residentErr
    residentsByPhone = (residentRows ?? []) as InboxResidentSummary[]
  }

  const enriched = rows.map((row) => {
    const r = row as {
      id: string
      phone: string
      resident_id: string | null
      last_message_at: string
      last_message_preview: string | null
      residents?: ResidentJoinSummary
    }

    if (hasDisplayableResidentJoin(r.residents)) {
      return {
        id: r.id,
        phone: r.phone,
        resident_id: r.resident_id,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        residents: residentSummaryFromJoin(r.residents),
      }
    }

    const matched = pickInboxResidentByPhone(residentsByPhone, r.phone)
    if (matched) {
      return {
        id: r.id,
        phone: r.phone,
        resident_id: r.resident_id ?? matched.id,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        residents: {
          full_name: matched.full_name,
          apartment_number: matched.apartment_number ?? null,
        },
      }
    }

    return {
      id: r.id,
      phone: r.phone,
      resident_id: r.resident_id,
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
      residents: null,
    }
  })

  // Backfill resident_id for older threads (best-effort)
  await Promise.all(
    enriched
      .filter((row) => {
        if (!row.resident_id) return false
        const orig = rows.find((o) => (o as { id: string }).id === row.id) as { resident_id?: string | null } | undefined
        return !orig?.resident_id
      })
      .map((row) =>
        admin.from('whatsapp_conversations').update({ resident_id: row.resident_id }).eq('id', row.id)
      )
  )

  return enriched
}

export async function listWhatsAppMessagesForConversation(
  admin: SupabaseClient,
  clientId: string,
  conversationId: string,
  limit = 200
) {
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('id, direction, body, message_type, interactive_payload, ticket_id, created_at, wa_message_id')
    .eq('client_id', clientId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listWhatsAppMessagesForPhone(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  limit = 200
) {
  const thread = await loadWhatsAppThreadForPhone(admin, clientId, phone, limit)
  return thread.messages
}

/** Same source as inbox — conversation thread for a resident phone (all in/out messages). */
export async function loadWhatsAppThreadForPhone(
  admin: SupabaseClient,
  clientId: string,
  phone: string,
  limit = 200
): Promise<WhatsAppThreadLoadResult> {
  const conversationId = await findConversationIdByPhone(admin, clientId, phone)
  if (!conversationId) {
    return { conversation_id: null, messages: [] }
  }
  const messages = await listWhatsAppMessagesForConversation(admin, clientId, conversationId, limit)
  return { conversation_id: conversationId, messages }
}

const WHATSAPP_SESSION_MS = 24 * 60 * 60 * 1000

/** True if resident messaged within last 24 hours (Meta session window). */
export async function isWithinWhatsAppSessionWindow(
  admin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<boolean> {
  const phoneKey = whatsAppConversationPhoneKey(phone)
  const sinceIso = new Date(Date.now() - WHATSAPP_SESSION_MS).toISOString()

  const conversationId = await findConversationIdByPhone(admin, clientId, phoneKey)
  if (conversationId) {
    const { data: lastIn } = await admin
      .from('whatsapp_messages')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastIn?.created_at) {
      const ageMs = Date.now() - new Date(lastIn.created_at as string).getTime()
      if (ageMs < WHATSAPP_SESSION_MS) return true
    }
  }

  // Fallback: resident opened a WhatsApp ticket in the last 24h — free text is allowed on Meta even if inbound log is missing.
  const phoneKeys =
    phoneKey === phone.trim() ? [phoneKey] : [phoneKey, phone.trim()].filter(Boolean)
  for (const key of phoneKeys) {
    const { data: recentWaTicket } = await admin
      .from('tickets')
      .select('id')
      .eq('client_id', clientId)
      .eq('reporter_phone', key)
      .eq('source', 'whatsapp')
      .is('deleted_at', null)
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle()
    if (recentWaTicket?.id) return true
  }

  return false
}
