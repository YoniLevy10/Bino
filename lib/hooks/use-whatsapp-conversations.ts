'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

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
  const res = await whatsappUiFetch('/api/whatsapp/conversations', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const json = (await res.json()) as { conversations?: WhatsAppConversationRow[]; error?: string }
  if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
  return json.conversations ?? []
}

export async function fetchWhatsAppMessages(
  conversationId: string,
  signal?: AbortSignal
): Promise<WhatsAppMessageRow[]> {
  const res = await whatsappUiFetch(
    `/api/whatsapp/messages?conversation_id=${encodeURIComponent(conversationId)}`,
    { credentials: 'same-origin', cache: 'no-store', signal }
  )
  const json = (await res.json()) as { messages?: WhatsAppMessageRow[]; error?: string }
  if (!res.ok) throw new Error(json.error || 'טעינת הודעות נכשלה')
  return json.messages ?? []
}

export function useWhatsAppConversations(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
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
    queryFn: ({ signal }) => fetchWhatsAppMessages(conversationId!, signal),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  })
}
