export type TicketMemoryRow = {
  status: string
  assignedWorkerId: string | null
  isRecurring: boolean
  createdAt: string
  closedAt: string | null
}

export type TicketMemorySummary = {
  open: number
  unassigned: number
  recurringOpen: number
  recurringRate: number | null
  medianResolutionHours: number | null
}

function hoursBetween(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return (end - start) / 36e5
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

/** Operational memory from a bounded ticket sample. Does not invent assignment timestamps. */
export function summarizeTicketMemory(rows: TicketMemoryRow[]): TicketMemorySummary {
  const openRows = rows.filter((row) => row.status !== 'CLOSED')
  const unassigned = openRows.filter((row) => !row.assignedWorkerId).length
  const recurringOpen = openRows.filter((row) => row.isRecurring).length
  const resolution = rows
    .map((row) => (row.closedAt ? hoursBetween(row.createdAt, row.closedAt) : null))
    .filter((value): value is number => value != null)
  return {
    open: openRows.length,
    unassigned,
    recurringOpen,
    recurringRate: openRows.length === 0 ? null : recurringOpen / openRows.length,
    medianResolutionHours: median(resolution),
  }
}
