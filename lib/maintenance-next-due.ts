import type { MaintenanceCadence } from '@/lib/maintenance-cadence'
import { normalizeMaintenanceCadence } from '@/lib/maintenance-cadence'

/** Compute next due after completing a recurring occurrence. */
export function nextDueAfter(
  dueAt: string | null | undefined,
  cadenceRaw: MaintenanceCadence | string | null | undefined,
  from = new Date()
): string {
  const cadence = normalizeMaintenanceCadence(cadenceRaw)
  const base = dueAt ? new Date(dueAt) : from
  const start = Number.isNaN(base.getTime()) ? new Date(from) : new Date(base)
  // If overdue, advance from «now» so we do not stack in the past
  const anchor = start < from ? new Date(from) : start

  switch (cadence) {
    case 'weekly':
      anchor.setDate(anchor.getDate() + 7)
      break
    case 'monthly':
      anchor.setMonth(anchor.getMonth() + 1)
      break
    case 'quarterly':
      anchor.setMonth(anchor.getMonth() + 3)
      break
    case 'yearly':
      anchor.setFullYear(anchor.getFullYear() + 1)
      break
    default:
      anchor.setDate(anchor.getDate() + 7)
  }
  return anchor.toISOString()
}
