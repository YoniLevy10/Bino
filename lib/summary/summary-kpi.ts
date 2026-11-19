/**
 * Summary page KPI helpers — keep on-screen metrics and Excel export in lockstep.
 */

export type SummaryPeriodValue = 'week' | 'month' | 'all' | 'custom'

export type SummaryRangeBounds = {
  from: Date
  toExclusive: Date
}

/** Stable key for the selected period (not wall-clock `to`), so cache/stale checks work. */
export function summaryPeriodKey(
  period: SummaryPeriodValue,
  customFrom: string,
  customTo: string,
  range: SummaryRangeBounds | null
): string {
  if (period === 'custom') return `custom:${customFrom}:${customTo}`
  if (period === 'all') return 'all'
  if (!range) return period
  // Week/month: pin to range start so the key is stable for the calendar bucket.
  return `${period}:${range.from.toISOString()}`
}

export function countOpenedInRange(
  tickets: Array<{ created_at: string }>,
  range: SummaryRangeBounds
): number {
  return tickets.filter((t) => {
    const createdAt = new Date(t.created_at)
    return createdAt >= range.from && createdAt < range.toExclusive
  }).length
}

export function countClosedInRange(
  tickets: Array<{ closed_at: string | null }>,
  range: SummaryRangeBounds
): number {
  return tickets.filter((t) => {
    if (!t.closed_at) return false
    const closedAt = new Date(t.closed_at)
    return closedAt >= range.from && closedAt < range.toExclusive
  }).length
}

export function computeSummaryRangeKpis(
  tickets: Array<{ created_at: string; closed_at: string | null }>,
  range: SummaryRangeBounds
): { openedInRange: number; closedInRange: number } {
  return {
    openedInRange: countOpenedInRange(tickets, range),
    closedInRange: countClosedInRange(tickets, range),
  }
}
