import { TICKET_STATUSES, type TicketStatus } from '@/lib/ticket-status'

/** Status value stored in DB for closed tickets. */
export const CLOSED_TICKET_STATUS = 'CLOSED' as const

/** All statuses except CLOSED — for operational lists. */
export const OPEN_TICKET_STATUS_VALUES: TicketStatus[] = TICKET_STATUSES.filter(
  (s) => s !== 'CLOSED'
)

export function isOpenTicket(status: string): boolean {
  return status !== CLOSED_TICKET_STATUS
}

/** Remove a ticket from an in-memory list (e.g. after close). */
export function removeTicketFromListState<T extends { id: string }>(
  tickets: T[],
  ticketId: string
): T[] {
  return tickets.filter((t) => t.id !== ticketId)
}
