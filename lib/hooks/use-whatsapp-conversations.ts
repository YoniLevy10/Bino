'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import { queryKeys } from '@/lib/query-keys'

export type WhatsAppConversationRow = {
  id: string
  phone: string
  last_message_at: string
  last_message_preview: string | null
  residents?:
    | { full_name?: string; apartment_number?: string | null }
    | { full_name?: string; apartment_number?: string | null }[]
    | null
}

export type WhatsAppMessageRow = {
  id: string
  direction: 'in' | 'out'
  body: string | null
  created_at: string
  ticket_id: string | null
}

export async function fetchWhatsAppConversations(): Promise<WhatsAppConversationRow[]> {
  const res = await whatsappUiFetch('/api/whatsapp/conversations')
  const json = (await res.json()) as { conversations?: WhatsAppConversationRow[]; error?: string }
  if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
  return json.conversations ?? []
}

export async function fetchWhatsAppMessages(conversationId: string): Promise<WhatsAppMessageRow[]> {
  const res = await whatsappUiFetch(
    `/api/whatsapp/messages?conversation_id=${encodeURIComponent(conversationId)}`
  )
  const json = (await res.json()) as { messages?: WhatsAppMessageRow[]; error?: string }
  if (!res.ok) throw new Error(json.error || 'טעינת הודעות נכשלה')
  return json.messages ?? []
}

export function useWhatsAppConversations(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: options?.enabled !== false,
  })
  const clientId = clientIdQuery.data

  const conversationsQuery = useQuery({
    queryKey: clientId ? queryKeys.whatsappConversations(clientId) : ['whatsapp-conversations', 'pending'],
    queryFn: fetchWhatsAppConversations,
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 30_000,
  })

  return {
    clientId: clientId ?? null,
    conversations: conversationsQuery.data ?? [],
    isLoading: clientIdQuery.isLoading || (conversationsQuery.isLoading && !conversationsQuery.data),
    isFetching: conversationsQuery.isFetching,
    error: clientIdQuery.error || conversationsQuery.error,
    refetch: conversationsQuery.refetch,
    invalidate: () =>
      clientId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.whatsappConversations(clientId) })
        : conversationsQuery.refetch(),
    hasData: Boolean(conversationsQuery.data) || conversationsQuery.isSuccess,
  }
}

export function useWhatsAppMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId
      ? queryKeys.whatsappMessages(conversationId)
      : (['whatsapp-messages', 'none'] as const),
    queryFn: () => fetchWhatsAppMessages(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
  })
}
