/**
 * Maintenance task cadence → color language for morning board + calendar.
 * Color = period only (not priority).
 */

export const MAINTENANCE_CADENCES = [
  'one_off',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const

export type MaintenanceCadence = (typeof MAINTENANCE_CADENCES)[number]

export const MAINTENANCE_CADENCE_LABELS: Record<MaintenanceCadence, string> = {
  one_off: 'חד־פעמי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  yearly: 'שנתי',
}

/** Hex colors for UI dots / calendar chips */
export const MAINTENANCE_CADENCE_COLORS: Record<MaintenanceCadence, string> = {
  one_off: '#64748b',
  weekly: '#0e7490',
  monthly: '#4d7c0f',
  quarterly: '#c2410c',
  yearly: '#3730a3',
}

/** Google Calendar colorId (1–11) — approximate mapping */
export const MAINTENANCE_CADENCE_GOOGLE_COLOR_ID: Record<MaintenanceCadence, string> = {
  one_off: '8',
  weekly: '7',
  monthly: '10',
  quarterly: '6',
  yearly: '9',
}

export function isMaintenanceCadence(raw: unknown): raw is MaintenanceCadence {
  return typeof raw === 'string' && (MAINTENANCE_CADENCES as readonly string[]).includes(raw)
}

export function normalizeMaintenanceCadence(raw: unknown): MaintenanceCadence {
  return isMaintenanceCadence(raw) ? raw : 'one_off'
}

export function cadenceColor(cadence: MaintenanceCadence | string | null | undefined): string {
  const c = normalizeMaintenanceCadence(cadence)
  return MAINTENANCE_CADENCE_COLORS[c]
}

export function cadenceLabel(cadence: MaintenanceCadence | string | null | undefined): string {
  const c = normalizeMaintenanceCadence(cadence)
  return MAINTENANCE_CADENCE_LABELS[c]
}

/** Morning board buckets relative to local now */
export type MorningBucket = 'overdue' | 'today' | 'week' | 'later'

export function morningBucket(dueAt: string | null | undefined, now = new Date()): MorningBucket | null {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endToday = new Date(startToday)
  endToday.setDate(endToday.getDate() + 1)
  const endWeek = new Date(startToday)
  endWeek.setDate(endWeek.getDate() + 7)

  if (due < startToday) return 'overdue'
  if (due < endToday) return 'today'
  if (due < endWeek) return 'week'
  return 'later'
}
