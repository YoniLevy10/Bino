/**
 * Product contract: every manager-facing ticket detail entry point must expose these capabilities.
 * Used by tests/ticket-detail-parity.test.ts to catch drift.
 */
export const TICKET_DETAIL_PARITY_FEATURES = [
  'attachments_section',
  'whatsapp_recover_button',
  'whatsapp_thread',
  'whatsapp_thread_recover_banner',
  'ticket_logs',
  'status_and_worker',
  'internal_chat',
  'close_ticket',
] as const

export type TicketDetailParityFeature = (typeof TICKET_DETAIL_PARITY_FEATURES)[number]

/** Pages/components that must satisfy the full manager ticket-detail contract. */
export const TICKET_DETAIL_ENTRY_POINTS = [
  {
    id: 'dashboard',
    pageFile: 'app/page.tsx',
    drawerComponent: 'TicketDetailDrawer',
  },
  {
    id: 'tickets',
    pageFile: 'app/tickets/page.tsx',
    drawerComponent: 'TicketDetailDrawer',
  },
] as const

/** Navigation sources that must deep-link into ticket detail. */
export const TICKET_DETAIL_NAV_SOURCES = [
  { id: 'global_search', file: 'app/components/GlobalSearch.tsx', mustUse: 'ticketDetailPath' },
  { id: 'summary_history', file: 'app/summary/page.tsx', mustUse: 'ticketDetailPath' },
  { id: 'projects_drawer', file: 'app/projects/page.tsx', mustUse: 'ticketDetailPath' },
  { id: 'workers_drawer', file: 'app/workers/page.tsx', mustUse: 'ticketDetailPath' },
  { id: 'dashboard_activity', file: 'app/page.tsx', mustUse: 'ticketDetailPath' },
] as const
