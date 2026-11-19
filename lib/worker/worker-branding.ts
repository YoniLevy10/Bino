/** Worker-portal tenant branding (logo) — separate from manager auth branding. */

export type WorkerPortalBranding = {
  displayName: string
  logoUrl: string | null
  clientId: string
}

export const WORKER_BRANDING_CACHE_PREFIX = 'bamakor_worker_branding_v1_' as const
/** Points at the last worker tenant so loaders can paint logo before bootstrap returns. */
export const WORKER_BRANDING_LAST_KEY = 'bamakor_worker_branding_last' as const

const TTL_MS = 7 * 24 * 60 * 60 * 1000

function brandingKey(clientId: string): string {
  return `${WORKER_BRANDING_CACHE_PREFIX}${clientId}`
}

export function writeWorkerPortalBranding(branding: WorkerPortalBranding): void {
  if (typeof localStorage === 'undefined' || !branding.clientId) return
  try {
    localStorage.setItem(
      brandingKey(branding.clientId),
      JSON.stringify({ branding, ts: Date.now() })
    )
    localStorage.setItem(WORKER_BRANDING_LAST_KEY, branding.clientId)
  } catch {
    /* quota / private mode */
  }
}

export function readWorkerPortalBranding(clientId: string): WorkerPortalBranding | null {
  if (typeof localStorage === 'undefined' || !clientId) return null
  try {
    const raw = localStorage.getItem(brandingKey(clientId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { branding?: WorkerPortalBranding; ts?: number }
    if (!parsed?.branding || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts >= TTL_MS) return null
    if (parsed.branding.clientId !== clientId) return null
    return parsed.branding
  } catch {
    return null
  }
}

/** Sync read for loaders — last known worker tenant logo. */
export function tryReadWorkerPortalBranding(): WorkerPortalBranding | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const lastId = localStorage.getItem(WORKER_BRANDING_LAST_KEY)?.trim() || ''
    if (!lastId) return null
    return readWorkerPortalBranding(lastId)
  } catch {
    return null
  }
}

export function clearWorkerPortalBranding(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const lastId = localStorage.getItem(WORKER_BRANDING_LAST_KEY)
    localStorage.removeItem(WORKER_BRANDING_LAST_KEY)
    if (lastId) localStorage.removeItem(brandingKey(lastId))
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(WORKER_BRANDING_CACHE_PREFIX)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
