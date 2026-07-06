'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchTicketForDetail } from '@/lib/fetch-ticket-for-detail'
import {
  parseTicketIdFromSearchParams,
  setTicketDeepLinkInUrl,
  ticketDetailPath,
} from '@/lib/ticket-deep-link'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'

type UseTicketDeepLinkOpenOptions<T extends { id: string }> = {
  tickets: T[]
  selectedTicketId?: string | null
  onOpenTicket: (ticket: T, opts?: { skipDeepLink?: boolean }) => void
  mapFetchedTicket: (row: TicketDetailRow) => T
  resolveClientId?: () => Promise<string>
}

/** Deep-link `?ticket=` handling + URL sync for ticket detail drawers. */
export function useTicketDeepLinkOpen<T extends { id: string }>({
  tickets,
  selectedTicketId,
  onOpenTicket,
  mapFetchedTicket,
  resolveClientId,
}: UseTicketDeepLinkOpenOptions<T>) {
  const router = useRouter()
  const deepLinkHandledRef = useRef<string | null>(null)
  const onOpenTicketRef = useRef(onOpenTicket)

  useEffect(() => {
    onOpenTicketRef.current = onOpenTicket
  }, [onOpenTicket])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ticketId = parseTicketIdFromSearchParams(new URLSearchParams(window.location.search))
    if (!ticketId || deepLinkHandledRef.current === ticketId) return
    if (selectedTicketId === ticketId) {
      deepLinkHandledRef.current = ticketId
      return
    }

    void (async () => {
      const fromList = tickets.find((t) => t.id === ticketId)
      if (fromList) {
        onOpenTicketRef.current(fromList, { skipDeepLink: true })
        return
      }
      const clientId = resolveClientId ? await resolveClientId() : await resolveBamakorClientIdForBrowser()
      const fetched = await fetchTicketForDetail(supabase, clientId, ticketId)
      if (fetched) {
        onOpenTicketRef.current(mapFetchedTicket(fetched), { skipDeepLink: true })
      }
    })()
  }, [tickets, selectedTicketId, mapFetchedTicket, resolveClientId])

  function markDeepLink(ticketId: string) {
    setTicketDeepLinkInUrl(ticketId)
    deepLinkHandledRef.current = ticketId
  }

  function clearDeepLink() {
    setTicketDeepLinkInUrl(null)
    deepLinkHandledRef.current = null
  }

  function openTicketById(ticketId: string) {
    const fromList = tickets.find((t) => t.id === ticketId)
    if (fromList) {
      onOpenTicket(fromList)
      return
    }
    router.push(ticketDetailPath(ticketId))
  }

  return { markDeepLink, clearDeepLink, openTicketById }
}
