'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { whatsappUiFetch, whatsappUiMutate } from '@/lib/whatsapp-ui-fetch'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'
import {
  useWhatsAppConversations,
  useWhatsAppMessages,
  useWhatsAppThreadMeta,
  type WhatsAppConversationRow,
  type WhatsAppMessageRow,
} from '@/lib/hooks/use-whatsapp-conversations'
import { isWhatsAppInboxV2ClientEnabled } from '@/lib/whatsapp-inbox-v2-flag'
import { buildInboxReadMapForRequest } from '@/lib/whatsapp-inbox-unread-local'

export type InboxV2Conversation = WhatsAppConversationRow & {
  project_id?: string | null
  building_name?: string | null
  last_inbound_at?: string | null
  has_open_ticket?: boolean
  in_session?: boolean
}

export type InboxBuildingOption = { id: string; name: string }

export type InboxListFilters = {
  buildingId: string | null
  status: 'all' | 'open_ticket' | 'awaiting_reply' | 'session_open' | 'session_closed'
  unreadOnly: boolean
}

const DEFAULT_FILTERS: InboxListFilters = {
  buildingId: null,
  status: 'all',
  unreadOnly: false,
}

export function useWhatsAppInboxV2Enabled(): boolean {
  return isWhatsAppInboxV2ClientEnabled()
}

async function fetchConversationsV2(
  filters: InboxListFilters
): Promise<{ conversations: InboxV2Conversation[]; buildingOptions: InboxBuildingOption[] }> {
  const params = new URLSearchParams()
  if (filters.buildingId) params.set('building_id', filters.buildingId)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.unreadOnly) {
    params.set('unread_only', 'true')
    const readMap = buildInboxReadMapForRequest()
    if (Object.keys(readMap).length > 0) {
      params.set('read_map', JSON.stringify(readMap))
    }
  }
  const qs = params.toString()
  const res = await whatsappUiFetch(`/api/whatsapp/conversations${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    conversations?: InboxV2Conversation[]
    building_options?: InboxBuildingOption[]
    error?: string
  }
  if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
  return {
    conversations: json.conversations ?? [],
    buildingOptions: json.building_options ?? [],
  }
}

export function useWhatsAppInboxV2Conversations() {
  const v2 = useWhatsAppInboxV2Enabled()
  const legacy = useWhatsAppConversations({ enabled: !v2 })
  const clientIdQuery = useTenantClientId({ enabled: v2 })
  const clientId = clientIdQuery.data
  const [filters, setFilters] = useState<InboxListFilters>(DEFAULT_FILTERS)
  const queryClient = useQueryClient()

  const v2Query = useQuery({
    queryKey: clientId
      ? [...queryKeys.whatsappConversations(clientId), 'v2', filters]
      : ['whatsapp-conversations', 'v2', 'pending'],
    queryFn: () => fetchConversationsV2(filters),
    enabled: v2 && Boolean(clientId),
    staleTime: 20_000,
  })

  const invalidate = useCallback(async () => {
    if (!v2) return legacy.invalidate()
    if (!clientId) return v2Query.refetch()
    await queryClient.invalidateQueries({
      queryKey: queryKeys.whatsappConversations(clientId),
    })
  }, [v2, legacy, clientId, queryClient, v2Query])

  if (!v2) {
    return {
      ...legacy,
      inboxV2: false as const,
      filters,
      setFilters,
      buildingOptions: [] as InboxBuildingOption[],
    }
  }

  return {
    inboxV2: true as const,
    clientId: clientId ?? null,
    conversations: v2Query.data?.conversations ?? [],
    buildingOptions: v2Query.data?.buildingOptions ?? [],
    filters,
    setFilters,
    isLoading: clientIdQuery.isLoading || (v2Query.isLoading && !v2Query.data),
    isFetching: v2Query.isFetching,
    error: clientIdQuery.error || v2Query.error,
    refetch: v2Query.refetch,
    invalidate,
    hasData: Boolean(v2Query.data) || v2Query.isSuccess,
  }
}

export type InboxMessageRow = WhatsAppMessageRow & {
  interactive_payload?: Record<string, unknown> | null
}

async function fetchInboxMessagesV2(conversationId: string): Promise<InboxMessageRow[]> {
  const res = await whatsappUiFetch(
    `/api/whatsapp/messages?conversation_id=${encodeURIComponent(conversationId)}`,
    { credentials: 'same-origin', cache: 'no-store' }
  )
  const json = (await res.json()) as { messages?: InboxMessageRow[]; error?: string }
  if (!res.ok) throw new Error(json.error || 'טעינת הודעות נכשלה')
  return json.messages ?? []
}

export function useWhatsAppInboxMessages(conversationId: string | null) {
  const v2 = useWhatsAppInboxV2Enabled()
  const legacy = useWhatsAppMessages(conversationId)

  const v2Query = useQuery({
    queryKey: conversationId
      ? [...queryKeys.whatsappMessages(conversationId), 'v2']
      : (['whatsapp-messages', 'none'] as const),
    queryFn: () => fetchInboxMessagesV2(conversationId!),
    enabled: v2 && Boolean(conversationId),
    staleTime: 20_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    networkMode: 'always',
  })

  if (!v2) return { inboxV2: false as const, ...legacy }

  return {
    inboxV2: true as const,
    data: v2Query.data,
    isLoading: v2Query.isLoading,
    isFetching: v2Query.isFetching,
    isError: v2Query.isError,
    error: v2Query.error,
    refetch: v2Query.refetch,
  }
}

export { useWhatsAppThreadMeta }

export async function startWhatsAppConversation(opts: {
  residentId?: string
  phone?: string
}) {
  const residentId = opts.residentId?.trim()
  const phone = opts.phone?.trim()
  if (!residentId && !phone) {
    throw new Error('יש לבחור דייר או להזין טלפון')
  }
  const res = await whatsappUiMutate('/api/whatsapp/start-conversation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(residentId ? { resident_id: residentId } : {}),
      ...(phone ? { phone } : {}),
    }),
  })
  const json = (await res.json()) as { conversation?: InboxV2Conversation; error?: string }
  if (!res.ok) throw new Error(json.error || 'יצירת שיחה נכשלה')
  return json.conversation!
}

export async function sendWhatsAppInboxMedia(
  phone: string,
  conversationId: string,
  file: File,
  caption?: string
) {
  const form = new FormData()
  form.set('phone', phone)
  form.set('conversation_id', conversationId)
  form.set('file', file)
  if (caption?.trim()) form.set('caption', caption.trim())

  const res = await whatsappUiMutate('/api/whatsapp/send-media', {
    method: 'POST',
    body: form,
  })
  const json = (await res.json()) as { error?: string; code?: string }
  if (!res.ok) {
    const err = new Error(json.error || 'שליחת קובץ נכשלה') as Error & { code?: string }
    err.code = json.code
    throw err
  }
}

export type ForwardDryRunPreview = {
  professional_name: string
  phones: string[]
  sms_body: string
  ticket_number: number
  building_name: string
}

export async function forwardFromInbox(opts: {
  ticketId: string
  professionalId: string
  note?: string
  dryRun?: boolean
}) {
  const res = await whatsappUiMutate('/api/whatsapp/forward-professional', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket_id: opts.ticketId,
      professional_id: opts.professionalId,
      note: opts.note ?? null,
      dry_run: opts.dryRun === true,
    }),
  })
  const json = (await res.json()) as {
    error?: string
    preview?: ForwardDryRunPreview
    ok?: boolean
    sms_sent?: boolean
    sms_note?: string
  }
  if (!res.ok) throw new Error(json.error || 'העברה נכשלה')
  return json
}