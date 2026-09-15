'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchTicketForDetail } from '@/lib/fetch-ticket-for-detail'
import {
  parseTicketIdFromSearchParams,
  pushTicketDeepLinkInUrl,
  setTicketDeepLinkInUrl,
  ticketDetailPath,
} from '@/lib/ticket-deep-link'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'

type UseTicketDeepLinkOpenOptions<T extends { id: string }> = {
  tickets: T[]
  selectedTicketId?: string | null
  onOpenTicket: (ticket: T, opts?: { skipDeepLink?: boolean }) => void
  onCloseDrawer?: () => void
  mapFetchedTicket: (row: TicketDetailRow) => T
  resolveClientId?: () => Promise<string>
}

/** Deep-link `?ticket=` handling + URL sync for ticket detail drawers. */
export function useTicketDeepLinkOpen<T extends { id: string }>({
  tickets,
  selectedTicketId,
  onOpenTicket,
  onCloseDrawer,
  mapFetchedTicket,
  resolveClientId,
}: UseTicketDeepLinkOpenOptions<T>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkHandledRef = useRef<string | null>(null)
  const onOpenTicketRef = useRef(onOpenTicket)
  const onCloseDrawerRef = useRef(onCloseDrawer)

  useEffect(() => {
    onOpenTicketRef.current = onOpenTicket
  }, [onOpenTicket])

  useEffect(() => {
    onCloseDrawerRef.current = onCloseDrawer
  }, [onCloseDrawer])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ticketId =
      parseTicketIdFromSearchParams(searchParams) ||
      parseTicketIdFromSearchParams(new URLSearchParams(window.location.search))
    if (!ticketId || deepLinkHandledRef.current === ticketId) return
    if (selectedTicketId === ticketId) {
      deepLinkHandledRef.current = ticketId
      return
    }

    void (async () => {
      const fromList = tickets.find((t) => t.id === ticketId)
      if (fromList) {
        deepLinkHandledRef.current = ticketId
        onOpenTicketRef.current(fromList, { skipDeepLink: true })
        return
      }
      const clientId = resolveClientId ? await resolveClientId() : await resolveBinoClientIdForBrowser()
      const fetched = await fetchTicketForDetail(supabase, clientId, ticketId)
      if (fetched) {
        deepLinkHandledRef.current = ticketId
        onOpenTicketRef.current(mapFetchedTicket(fetched), { skipDeepLink: true })
      }
    })()
  }, [tickets, selectedTicketId, mapFetchedTicket, resolveClientId, searchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = () => {
      const ticketId = parseTicketIdFromSearchParams(new URLSearchParams(window.location.search))
      if (!ticketId && selectedTicketId) {
        deepLinkHandledRef.current = null
        onCloseDrawerRef.current?.()
      } else if (ticketId) {
        deepLinkHandledRef.current = ticketId
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [selectedTicketId])

  function markDeepLink(ticketId: string) {
    pushTicketDeepLinkInUrl(ticketId)
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
