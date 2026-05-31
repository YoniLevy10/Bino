/**
 * Ticket workflow statuses — single source of truth for UI, API, WhatsApp, exports.
 */
export const TICKET_STATUSES = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'SITE_TOUR',
  'PROFESSIONAL_ESCORT',
  'CLOSED',
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

const LABELS_HE: Record<TicketStatus, string> = {
  NEW: 'חדש',
  ASSIGNED: 'משויך',
  IN_PROGRESS: 'בטיפול',
  WAITING_PARTS: 'ממתין לחלקים',
  SITE_TOUR: 'סיור',
  PROFESSIONAL_ESCORT: 'ליווי בעל מקצוע',
  CLOSED: 'סגור',
}

const LABELS_HE_FEMININE: Record<TicketStatus, string> = {
  NEW: 'חדשה',
  ASSIGNED: 'משויכת',
  IN_PROGRESS: 'בטיפול',
  WAITING_PARTS: 'ממתינה לחלקים',
  SITE_TOUR: 'בסיור',
  PROFESSIONAL_ESCORT: 'בליווי בעל מקצוע',
  CLOSED: 'סגורה',
}

/** Open ticket — not closed (for lists, worker portal, WA status query). */
export const TICKET_STATUSES_IN_TREATMENT: readonly TicketStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'SITE_TOUR',
  'PROFESSIONAL_ESCORT',
]

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value)
}

export function isTicketClosed(status: string): boolean {
  return status === 'CLOSED'
}

export function isTicketInTreatment(status: string): boolean {
  return (TICKET_STATUSES_IN_TREATMENT as readonly string[]).includes(status)
}

export function ticketStatusLabelHe(status: string, opts?: { feminine?: boolean }): string {
  const map = opts?.feminine ? LABELS_HE_FEMININE : LABELS_HE
  if (isTicketStatus(status)) return map[status]
  return status
}

export const TICKET_STATUS_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'כל הסטטוסים', value: 'ALL' },
  ...TICKET_STATUSES.map((value) => ({ label: LABELS_HE[value], value })),
]
