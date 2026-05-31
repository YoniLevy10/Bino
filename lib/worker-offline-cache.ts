/** Cached worker ticket list for offline / flaky network on the field portal. */
export const WORKER_TICKETS_CACHE_KEY = 'bamakor_worker_tickets_cache'

export type CachedWorkerTickets = {
  fetchedAt: string
  tickets: unknown[]
}

export function readWorkerTicketsCache(): CachedWorkerTickets | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(WORKER_TICKETS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedWorkerTickets
    if (!parsed?.fetchedAt || !Array.isArray(parsed.tickets)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeWorkerTicketsCache(tickets: unknown[]): void {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedWorkerTickets = { fetchedAt: new Date().toISOString(), tickets }
    localStorage.setItem(WORKER_TICKETS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}
