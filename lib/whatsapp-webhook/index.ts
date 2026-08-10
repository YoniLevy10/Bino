export {
  parseStartCode,
  isNumericSelection,
  searchProjectsByBuilding,
  searchProjectsInList,
  fetchAllProjectsForClient,
  WA_PROJECT_LIST_MAX_ROWS,
  createPendingSelection,
  getPendingSelection,
  clearPendingSelection,
} from '@/lib/whatsapp-webhook/project-selection'
export { expireInactiveSessions, getActiveSession, type SessionRow } from '@/lib/whatsapp-webhook/session-expire'
export { createWebhookOutboundPersisters, type WebhookOutboundPersisters } from '@/lib/whatsapp-webhook/persist-message'
export {
  parseIncomingWhatsAppMessage,
  extractWhatsAppPhoneNumberId,
  webhookDedupeMessageId,
} from '@/lib/whatsapp-webhook/parse-inbound'
export { runWhatsAppInboundBackground, type WaWebhookTenant } from '@/lib/whatsapp-webhook/dispatch-inbound'
export {
  findOpenTicketForReporterInWindow,
  findOpenTicketForPhone,
  findRecentTicketForPhone,
  findDuplicateOpenWhatsAppTicket,
  isBenignWhatsAppTicketDuplicateError,
  normalizeTicketDescriptionForCompare,
  parseRecentDuplicateWhatsAppTicketError,
  readLastReporterProject,
} from '@/lib/whatsapp-webhook/flow-ticket'
export { fetchOpenTicketStatusLines } from '@/lib/whatsapp-webhook/flow-status'
