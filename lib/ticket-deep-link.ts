/** Canonical query param for opening a ticket detail drawer. */
export const TICKET_DEEP_LINK_PARAM = 'ticket' as const

export function ticketDetailPath(ticketId: string): string {
  return `/tickets?${TICKET_DEEP_LINK_PARAM}=${encodeURIComponent(ticketId)}`
}

export function parseTicketIdFromSearchParams(
  params: URLSearchParams | { get(name: string): string | null }
): string | null {
  const id = params.get(TICKET_DEEP_LINK_PARAM)?.trim()
  return id || null
}

export function setTicketDeepLinkInUrl(ticketId: string | null): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (ticketId) {
    params.set(TICKET_DEEP_LINK_PARAM, ticketId)
  } else {
    params.delete(TICKET_DEEP_LINK_PARAM)
  }
  const qs = params.toString()
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', next)
}

/** Push a history entry so the browser back button closes the drawer. */
export function pushTicketDeepLinkInUrl(ticketId: string): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.set(TICKET_DEEP_LINK_PARAM, ticketId)
  const qs = params.toString()
  window.history.pushState(null, '', `${window.location.pathname}?${qs}`)
}
