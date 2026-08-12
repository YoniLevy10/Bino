/**
 * Fixly env + category / status helpers for Bamakor ↔ Fixly integration.
 */

export type FixlyPriority = 'low' | 'medium' | 'high' | 'urgent'
export type FixlyAssignmentMode = 'broadcast_first_accept' | 'manual_select'

export const FIXLY_STATUSES = [
  'offered',
  'accepted',
  'en_route',
  'in_progress',
  'completed',
  'cancelled',
  'no_providers',
  'expired',
  'rejected_by_all',
] as const

export type FixlyStatus = (typeof FIXLY_STATUSES)[number]

export type FixlyStatusPresentation = {
  labelHe: string
  tone: 'warning' | 'info' | 'success' | 'neutral' | 'danger'
}

export const FIXLY_STATUS_UI: Record<FixlyStatus, FixlyStatusPresentation> = {
  offered: { labelHe: 'נשלח ל-Fixly — מחפש מקצוען', tone: 'warning' },
  accepted: { labelHe: 'אישור ע״י בעל מקצוע', tone: 'info' },
  en_route: { labelHe: 'בעל מקצוע בדרך', tone: 'success' },
  in_progress: { labelHe: 'טיפול בעזרת Fixly', tone: 'success' },
  completed: { labelHe: 'טופל דרך Fixly', tone: 'success' },
  cancelled: { labelHe: 'בוטל', tone: 'neutral' },
  no_providers: { labelHe: 'אין בעל מקצוע זמין באזור', tone: 'danger' },
  expired: { labelHe: 'פג תוקף ההזמנה', tone: 'neutral' },
  rejected_by_all: { labelHe: 'אין בעל מקצוע זמין', tone: 'danger' },
}

export const FIXLY_CATEGORIES = [
  { value: 'elevators', labelHe: 'מעליות' },
  { value: 'electricity', labelHe: 'חשמל' },
  { value: 'plumbing', labelHe: 'אינסטלציה' },
  { value: 'cleaning', labelHe: 'ניקיון' },
  { value: 'ac', labelHe: 'מיזוג' },
  { value: 'gardening', labelHe: 'גינון' },
  { value: 'locksmith', labelHe: 'מנעולים' },
  { value: 'pest_control', labelHe: 'הדברה' },
  { value: 'painting', labelHe: 'צבע' },
  { value: 'carpentry', labelHe: 'נגרות' },
  { value: 'moving', labelHe: 'הובלות' },
  { value: 'tiling', labelHe: 'ריצוף' },
  { value: 'general', labelHe: 'כללי / אחר' },
] as const

export type FixlyCategory = (typeof FIXLY_CATEGORIES)[number]['value']

const CATEGORY_ALIASES: Record<string, FixlyCategory> = {
  elevator: 'elevators',
  elevators: 'elevators',
  מעליות: 'elevators',
  מעלית: 'elevators',
  electricity: 'electricity',
  electrical: 'electricity',
  חשמל: 'electricity',
  plumbing: 'plumbing',
  אינסטלציה: 'plumbing',
  אינסטלטור: 'plumbing',
  cleaning: 'cleaning',
  ניקיון: 'cleaning',
  ac: 'ac',
  hvac: 'ac',
  מיזוג: 'ac',
  gardening: 'gardening',
  גינון: 'gardening',
  locksmith: 'locksmith',
  מנעולים: 'locksmith',
  pest: 'pest_control',
  pest_control: 'pest_control',
  הדברה: 'pest_control',
  painting: 'painting',
  צבע: 'painting',
  צבעי: 'painting',
  carpentry: 'carpentry',
  נגרות: 'carpentry',
  moving: 'moving',
  הובלות: 'moving',
  tiling: 'tiling',
  ריצוף: 'tiling',
  general: 'general',
  other: 'general',
  אחר: 'general',
}

export function mapToFixlyCategory(raw: string | null | undefined): FixlyCategory {
  if (!raw) return 'general'
  const key = raw.trim().toLowerCase()
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[raw.trim()] ?? 'general'
}

/** Bamakor ticket priority → Fixly priority. */
export function mapBamakorPriorityToFixly(priority: string | null | undefined): FixlyPriority {
  switch ((priority || '').toUpperCase()) {
    case 'LOW':
      return 'low'
    case 'HIGH':
      return 'high'
    case 'URGENT':
      return 'urgent'
    case 'MEDIUM':
    default:
      return 'medium'
  }
}

export function mapFixlyPriorityToBamakor(priority: FixlyPriority): string {
  switch (priority) {
    case 'low':
      return 'LOW'
    case 'high':
      return 'HIGH'
    case 'urgent':
      return 'URGENT'
    case 'medium':
    default:
      return 'MEDIUM'
  }
}

export function getFixlyStatusPresentation(status: string | null | undefined): FixlyStatusPresentation {
  if (status && status in FIXLY_STATUS_UI) {
    return FIXLY_STATUS_UI[status as FixlyStatus]
  }
  return { labelHe: status?.trim() || 'סטטוס לא ידוע', tone: 'neutral' }
}

/**
 * Map Fixly job status → Bamakor ticket.status update (or null = leave unchanged).
 */
export function mapFixlyStatusToTicketStatus(fixlyStatus: string): string | null {
  switch (fixlyStatus) {
    case 'accepted':
    case 'en_route':
    case 'in_progress':
      return 'PROFESSIONAL_ESCORT'
    case 'completed':
      return 'CLOSED'
    case 'cancelled':
    case 'no_providers':
    case 'expired':
    case 'rejected_by_all':
      return 'NEW'
    default:
      return null
  }
}

export function getFixlyBaseUrl(): string {
  return (process.env.FIXLY_BASE_URL || 'https://fixly-five.vercel.app').replace(/\/$/, '')
}

export function getFixlyApiKey(): string {
  return (process.env.FIXLY_API_KEY || '').trim()
}

export function getBamakorWebhookSecret(): string {
  return (process.env.BAMAKOR_WEBHOOK_SECRET || '').trim()
}

export function isFixlyConfigured(): boolean {
  return getFixlyApiKey().length > 0 && getBamakorWebhookSecret().length > 0
}

/** Best-effort city from "street, city" style address. */
export function inferCityFromAddress(address: string | null | undefined): string {
  if (!address?.trim()) return ''
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1] || ''
  return ''
}

export function truncateTitle(description: string | null | undefined, max = 80): string {
  const t = (description || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'תקלה'
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}
