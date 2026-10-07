'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isFetchTimeoutError } from '@/lib/fetch-with-timeout'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import type { WhatsAppInboxContext } from '@/lib/whatsapp-inbox-context'
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
  message_type?: string | null
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

export type WhatsAppThreadPayload = {
  messages: WhatsAppMessageRow[]
  inSession: boolean
  context: WhatsAppInboxContext | null
}

export async function fetchWhatsAppMessages(
  conversationId: string,
  signal?: AbortSignal
): Promise<WhatsAppThreadPayload> {
  const res = await whatsappUiFetch(
    `/api/whatsapp/messages?conversation_id=${encodeURIComponent(conversationId)}`,
    { credentials: 'same-origin', cache: 'no-store', signal }
  )
  const json = (await res.json()) as {
    messages?: WhatsAppMessageRow[]
    in_session?: boolean
    context?: WhatsAppInboxContext | null
    error?: string
  }
  if (!res.ok) throw new Error(json.error || 'טעינת הודעות נכשלה')
  return {
    messages: json.messages ?? [],
    inSession: json.in_session !== false,
    context: json.context ?? null,
  }
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
    invalidate: useCallback(() => {
      if (!clientId) return conversationsQuery.refetch()
      return queryClient.invalidateQueries({ queryKey: queryKeys.whatsappConversations(clientId) })
    }, [clientId, conversationsQuery.refetch, queryClient]),
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
    staleTime: 20_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    retry: (failureCount, error) => failureCount < 1 && !isFetchTimeoutError(error),
    retryDelay: 1000,
  })
}
