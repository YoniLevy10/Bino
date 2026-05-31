/** Persists field-worker access token across PWA launches (localStorage + sessionStorage). */
export const WORKER_TOKEN_KEY = 'bamakor_worker_token'

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

export function clearWorkerToken(): void {
  try {
    localStorage.removeItem(WORKER_TOKEN_KEY)
    sessionStorage.removeItem(WORKER_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
