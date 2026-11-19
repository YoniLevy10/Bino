/** Cached worker ticket list for offline / flaky network on the field portal. */

/** Legacy unkeyed blob — never paint; remove on read/write. */
export const WORKER_TICKETS_CACHE_LEGACY_KEY = 'bamakor_worker_tickets_cache'

/** Prefixed SWR: bamakor_worker_tickets_v2_{workerId} */
export const WORKER_TICKETS_CACHE_PREFIX = 'bamakor_worker_tickets_v2_' as const

export type CachedWorkerTickets = {
  fetchedAt: string
  workerId: string
  tickets: unknown[]
}

function isOpenWorkerTicket(row: unknown): boolean {
  const status = (row as { status?: string | null } | null)?.status
  return status !== 'CLOSED'
}

export function filterOpenWorkerTickets<T extends { status: string }>(tickets: T[]): T[] {
  return tickets.filter((t) => t.status !== 'CLOSED')
}

export function workerTicketsCacheKey(workerId: string): string {
  return `${WORKER_TICKETS_CACHE_PREFIX}${workerId}`
}

function dropLegacyWorkerTicketsCache(): void {
  try {
    localStorage.removeItem(WORKER_TICKETS_CACHE_LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Read tickets cached for this worker only.
 * Never returns another worker's blob (cross-worker flash).
 */
export function readWorkerTicketsCache(workerId: string): CachedWorkerTickets | null {
  if (typeof window === 'undefined' || !workerId) return null
  try {
    dropLegacyWorkerTicketsCache()
    const raw = localStorage.getItem(workerTicketsCacheKey(workerId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedWorkerTickets
    if (!parsed?.fetchedAt || !Array.isArray(parsed.tickets)) return null
    if (parsed.workerId && parsed.workerId !== workerId) return null
    return {
      fetchedAt: parsed.fetchedAt,
      workerId,
      tickets: parsed.tickets.filter(isOpenWorkerTicket),
    }
  } catch {
    return null
  }
}

export function writeWorkerTicketsCache(workerId: string, tickets: unknown[]): void {
  if (typeof window === 'undefined' || !workerId) return
  try {
    dropLegacyWorkerTicketsCache()
    const openTickets = tickets.filter(isOpenWorkerTicket)
    const payload: CachedWorkerTickets = {
      fetchedAt: new Date().toISOString(),
      workerId,
      tickets: openTickets,
    }
    localStorage.setItem(workerTicketsCacheKey(workerId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

/** Remove all v2 worker ticket caches + legacy key (auth / token clear). */
export function clearAllWorkerTicketsCaches(): void {
  if (typeof window === 'undefined') return
  try {
    dropLegacyWorkerTicketsCache()
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(WORKER_TICKETS_CACHE_PREFIX)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
