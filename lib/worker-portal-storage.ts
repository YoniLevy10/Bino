/** Persists field-worker access token across PWA launches (localStorage + sessionStorage). */
import { clearAllWorkerTicketsCaches } from '@/lib/worker-offline-cache'

export const WORKER_TOKEN_KEY = 'bamakor_worker_token'

/** Last authenticated worker id — used to paint SWR tickets before bootstrap returns. */
export const WORKER_LAST_ID_KEY = 'bamakor_worker_last_id'

const TOKEN_RE = /^[a-f0-9-]{36}$/i

export function normalizeWorkerToken(raw: string | null | undefined): string | null {
  const token = raw?.trim().toLowerCase() ?? ''
  return TOKEN_RE.test(token) ? token : null
}

export function readWorkerToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    normalizeWorkerToken(localStorage.getItem(WORKER_TOKEN_KEY)) ??
    normalizeWorkerToken(sessionStorage.getItem(WORKER_TOKEN_KEY))
  )
}

export function writeWorkerToken(token: string): void {
  const normalized = normalizeWorkerToken(token)
  if (!normalized) return
  try {
    localStorage.setItem(WORKER_TOKEN_KEY, normalized)
    sessionStorage.setItem(WORKER_TOKEN_KEY, normalized)
  } catch {
    /* quota / private mode */
  }
}

export function readLastWorkerId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const id = localStorage.getItem(WORKER_LAST_ID_KEY)?.trim() || ''
    return id || null
  } catch {
    return null
  }
}

export function writeLastWorkerId(workerId: string): void {
  if (typeof window === 'undefined' || !workerId) return
  try {
    localStorage.setItem(WORKER_LAST_ID_KEY, workerId)
  } catch {
    /* ignore */
  }
}

export function clearWorkerToken(): void {
  try {
    localStorage.removeItem(WORKER_TOKEN_KEY)
    sessionStorage.removeItem(WORKER_TOKEN_KEY)
    localStorage.removeItem(WORKER_LAST_ID_KEY)
  } catch {
    /* ignore */
  }
  clearAllWorkerTicketsCaches()
}
