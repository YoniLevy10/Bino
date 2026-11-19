import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents/residents-whatsapp'
import { listWhatsAppConversations } from '@/lib/whatsapp/whatsapp-message-store'
import { inboundIsWithinWhatsAppSession } from '@/lib/whatsapp/whatsapp-message-store'

function inboundSessionFromIso(iso: string): boolean {
  return inboundIsWithinWhatsAppSession(iso)
}

export type WhatsAppInboxConversationRow = Awaited<ReturnType<typeof listWhatsAppConversations>>[number]

export type WhatsAppInboxConversationV2 = WhatsAppInboxConversationRow & {
  project_id: string | null
  building_name: string | null
  last_inbound_at: string | null
  has_open_ticket: boolean
  in_session: boolean
}

type InboxListFilters = {
  buildingId?: string
  status?: 'all' | 'open_ticket' | 'awaiting_reply' | 'session_open' | 'session_closed'
  unreadOnly?: boolean
  /** ISO timestamps per conversation id — from client local read map */
  unreadBeforeByConversation?: Record<string, string>
}

function lastInboundMapFromRows(
  rows: { conversation_id: string; created_at: string }[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    if (!map.has(row.conversation_id)) map.set(row.conversation_id, row.created_at)
  }
  return map
}

async function batchLastInboundAt(
  admin: SupabaseClient,
  clientId: string,
  conversationIds: string[]
): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map()
  const { data } = await admin
    .from('whatsapp_messages')
    .select('conversation_id, created_at')
    .eq('client_id', clientId)
    .eq('direction', 'in')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
    .limit(500)

  return lastInboundMapFromRows(
    (data ?? []) as { conversation_id: string; created_at: string }[]
  )
}

async function openTicketPhoneSet(
  admin: SupabaseClient,
  clientId: string,
  phones: string[]
): Promise<Set<string>> {
  const keys = [...new Set(phones.map((p) => normalizePhone(p)).filter(Boolean))]
  if (keys.length === 0) return new Set()
  const { data } = await admin
    .from('tickets')
    .select('reporter_phone')
    .eq('client_id', clientId)
    .in('reporter_phone', keys)
    .neq('status', 'CLOSED')
    .is('deleted_at', null)
    .limit(200)

  return new Set(
    ((data ?? []) as { reporter_phone?: string }[])
      .map((r) => r.reporter_phone)
      .filter((p): p is string => Boolean(p))
  )
}

export async function listWhatsAppConversationsV2(
  admin: SupabaseClient,
  clientId: string,
  filters: InboxListFilters,
  limit = 80
): Promise<WhatsAppInboxConversationV2[]> {
  const base = await listWhatsAppConversations(admin, clientId, Math.min(limit, 120))
  const phones = base.map((r) => r.phone)
  const normalized = [...new Set(phones.map((p) => normalizePhone(p)).filter(Boolean))]

  const residentByPhone = new Map<
    string,
    { project_id: string | null; building_name: string | null }
  >()

  if (normalized.length > 0) {
    const { data: residents } = await admin
      .from('residents')
      .select('normalized_phone, project_id, projects(name)')
      .eq('client_id', clientId)
      .in('normalized_phone', normalized)
      .is('deleted_at', null)
      .limit(500)

    for (const row of residents ?? []) {
      const phone = (row as { normalized_phone?: string }).normalized_phone
      if (!phone) continue
      const projects = (row as { projects?: { name?: string } | { name?: string }[] }).projects
      const building =
        Array.isArray(projects) ? projects[0]?.name : (projects as { name?: string } | undefined)?.name
      residentByPhone.set(phone, {
        project_id: (row as { project_id?: string }).project_id ?? null,
        building_name: building?.trim() || null,
      })
    }
  }

  const ids = base.map((r) => r.id)
  const [lastInboundByConv, openPhones] = await Promise.all([
    batchLastInboundAt(admin, clientId, ids),
    openTicketPhoneSet(
      admin,
      clientId,
      base.map((r) => r.phone)
    ),
  ])

  const enriched: WhatsAppInboxConversationV2[] = []

  for (const row of base) {
    const phoneKey = normalizePhone(row.phone)
    const residentMeta = residentByPhone.get(phoneKey) ?? {
      project_id: null,
      building_name: null,
    }

    const lastIn = lastInboundByConv.get(row.id) ?? null
    const openTicket = openPhones.has(phoneKey) || openPhones.has(row.phone)
    const inSession = Boolean(lastIn && inboundSessionFromIso(lastIn))

    enriched.push({
      ...row,
      project_id: residentMeta.project_id,
      building_name: residentMeta.building_name,
      last_inbound_at: lastIn,
      has_open_ticket: openTicket,
      in_session: inSession,
    })
  }

  let rows = enriched

  if (filters.buildingId) {
    rows = rows.filter((r) => r.project_id === filters.buildingId)
  }

  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((r) => {
      switch (filters.status) {
        case 'open_ticket':
          return r.has_open_ticket
        case 'awaiting_reply':
          return Boolean(r.last_inbound_at)
        case 'session_open':
          return r.in_session
        case 'session_closed':
          return !r.in_session
        default:
          return true
      }
    })
  }

  if (filters.unreadOnly && filters.unreadBeforeByConversation) {
    const map = filters.unreadBeforeByConversation
    rows = rows.filter((r) => {
      const lastIn = r.last_inbound_at
      if (!lastIn) return false
      const readAt = map[r.id]
      if (!readAt) return true
      return new Date(lastIn).getTime() > new Date(readAt).getTime()
    })
  }

  return rows.slice(0, limit)
}