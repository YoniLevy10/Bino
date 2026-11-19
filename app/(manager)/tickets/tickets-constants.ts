import { OPEN_TICKET_STATUS_FILTER_OPTIONS } from '@/lib/tickets/ticket-status'

export const statusOptions = [
  ...OPEN_TICKET_STATUS_FILTER_OPTIONS.slice(0, 1),
  { label: 'כל הטיפול', value: 'IN_TREATMENT' },
  ...OPEN_TICKET_STATUS_FILTER_OPTIONS.slice(1),
]

export const REFRESH_DEBOUNCE_MS = 30_000
export const TICKETS_INITIAL_LIMIT = 200

export const MOBILE_QUICK_STATUS_CHIPS: { label: string; value: string }[] = [
  { label: 'הכל', value: 'ALL' },
  { label: 'חדשות', value: 'NEW' },
  { label: 'בטיפול', value: 'IN_PROGRESS' },
  { label: 'דחופות', value: 'URGENT' },
]

export const priorityOptions = [
  { label: 'כל העדיפויות', value: 'ALL' },
  { label: 'דחופה', value: 'URGENT' },
  { label: 'גבוהה', value: 'HIGH' },
  { label: 'בינונית', value: 'MEDIUM' },
  { label: 'נמוכה', value: 'LOW' },
]

export const TICKETS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
