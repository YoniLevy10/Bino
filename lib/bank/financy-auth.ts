import { fetchWithTimeout } from '@/lib/shared/fetch-timeout'

const TOKEN_URL = 'https://api.open-finance.ai/oauth/token'
const TOKEN_SKEW_MS = 60_000

export type FinancyCredentials = {
  clientId: string
  clientSecret: string
  userId: string
}

type CachedToken = {
  accessToken: string
  expiresAtMs: number
}

const tokenCache = new Map<string, CachedToken>()

function cacheKey(creds: FinancyCredentials): string {
  return `${creds.clientId}::${creds.userId}`
}

export function clearFinancyTokenCache(creds?: FinancyCredentials): void {
  if (!creds) {
    tokenCache.clear()
    return
  }
  tokenCache.delete(cacheKey(creds))
}

export function isFinancyCredentialsComplete(
  creds: Partial<FinancyCredentials> | null | undefined
): creds is FinancyCredentials {
  return Boolean(
    creds?.clientId?.trim() &&
      creds?.clientSecret?.trim() &&
      creds?.userId?.trim()
  )
}

/**
 * OAuth2 client-credentials style token for a Financy end-user.
 * Caches until near expiry; on 401 callers should clearFinancyTokenCache and retry once.
 */
export async function getFinancyAccessToken(
  creds: FinancyCredentials
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const key = cacheKey(creds)
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAtMs > Date.now() + TOKEN_SKEW_MS) {
    return { ok: true, accessToken: cached.accessToken }
  }

  const res = await fetchWithTimeout(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        userId: creds.userId,
      }),
    },
    20_000
  )

  if (!res) {
    return { ok: false, error: 'Financy token timeout' }
  }

  const json = (await res.json().catch(() => null)) as {
    accessToken?: string
    expiresIn?: number
    error?: string
    message?: string
  } | null

  if (!res.ok || !json?.accessToken) {
    const { formatFinancyError } = await import('@/lib/bank/financy-errors')
    return {
      ok: false,
      error: formatFinancyError({
        status: res.status,
        message: json?.message,
        error: json?.error,
      }),
    }
  }

  const expiresInSec = typeof json.expiresIn === 'number' ? json.expiresIn : 86_400
  tokenCache.set(key, {
    accessToken: json.accessToken,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  })

  return { ok: true, accessToken: json.accessToken }
}
