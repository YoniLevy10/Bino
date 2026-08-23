import { fetchWithTimeout } from '@/lib/fetch-timeout'
import {
  greenInvoiceBaseUrl,
  greenInvoiceIdpTokenUrl,
  looksLikeUrlAsApiKeyId,
  type GreenInvoiceApiError,
  type GreenInvoiceBusinessSummary,
  type GreenInvoiceCredentials,
} from '@/lib/greeninvoice-config'
import {
  formatGreenInvoiceAuthError,
  morningAuthEnvHint,
  parseGreenInvoiceTokenResponse,
  safeGreenInvoiceAuthLog,
} from '@/lib/greeninvoice-token'

const TOKEN_TIMEOUT_MS = 15_000
const API_TIMEOUT_MS = 20_000

export type GreenInvoiceTokenResult =
  | { ok: true; token: string; expires: number }
  | { ok: false; status: number; error: string; errorCode?: number }

type GreenInvoiceRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  businessId?: string | null
}

export type GreenInvoiceConnectionTestResult = {
  ok: boolean
  businesses: GreenInvoiceBusinessSummary[]
  currentBusiness: GreenInvoiceBusinessSummary | null
  error?: string
  errorCode?: number
}

function baseUrl(env: GreenInvoiceCredentials['env']): string {
  return greenInvoiceBaseUrl(env)
}

async function postTokenRequest(
  url: string,
  body: Record<string, string>
): Promise<{ res: Response | null; data: unknown }> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
      TOKEN_TIMEOUT_MS
    )
    if (!res) return { res: null, data: null }
    return { res, data: await parseJsonBody(res) }
  } catch (err) {
    console.error('[greeninvoice] token request error', new URL(url).host, err instanceof Error ? err.message : 'error')
    return { res: null, data: null }
  }
}

async function parseJsonBody<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

function formatApiError(data: GreenInvoiceApiError | null, fallback: string): string {
  if (data?.errorMessage) return data.errorMessage
  return fallback
}

/**
 * Obtain a bearer token. Morning retired `/account/token` (June 2026) in favor of
 * OAuth 2.0 IdP. We try IdP first, then the legacy resource-API path for old keys.
 */
export async function obtainGreenInvoiceToken(
  credentials: Pick<GreenInvoiceCredentials, 'env' | 'apiKeyId' | 'apiSecret'>
): Promise<GreenInvoiceTokenResult> {
  if (looksLikeUrlAsApiKeyId(credentials.apiKeyId)) {
    return {
      ok: false,
      status: 400,
      error: 'מזהה המפתח נראה כמו כתובת אתר. הדביקו את Key ID מ-Morning → הגדרות → מפתחות API (UUID), לא קישור לדשבורד.',
    }
  }

  const idp = await postTokenRequest(greenInvoiceIdpTokenUrl(credentials.env), {
    grant_type: 'client_credentials',
    client_id: credentials.apiKeyId,
    client_secret: credentials.apiSecret,
  })
  const idpToken = idp.res?.ok ? parseGreenInvoiceTokenResponse(idp.data) : null
  if (idpToken) return { ok: true, ...idpToken }

  const legacy = await postTokenRequest(`${baseUrl(credentials.env)}/account/token`, {
    grant_type: 'client_credentials',
    id: credentials.apiKeyId,
    secret: credentials.apiSecret,
  })
  const legacyToken = legacy.res?.ok ? parseGreenInvoiceTokenResponse(legacy.data) : null
  if (legacyToken) return { ok: true, ...legacyToken }

  const idpStatus = idp.res?.status ?? 0
  const legacyStatus = legacy.res?.status ?? 0
  console.error('[greeninvoice] token failed', {
    env: credentials.env,
    idpStatus,
    legacyStatus,
    idpError: safeGreenInvoiceAuthLog(idp.data),
    legacyError: safeGreenInvoiceAuthLog(legacy.data),
  })

  if (!idp.res && !legacy.res) {
    return { ok: false, status: 0, error: 'פסק זמן בחיבור ל-Morning' }
  }

  const morningMsg = formatGreenInvoiceAuthError(idp.data) || formatGreenInvoiceAuthError(legacy.data)
  const hint = morningAuthEnvHint(credentials.env)
  const errorCode = [idp.data, legacy.data]
    .map((row) =>
      row && typeof row === 'object' && typeof (row as { errorCode?: unknown }).errorCode === 'number'
        ? (row as { errorCode: number }).errorCode
        : undefined
    )
    .find((code) => code !== undefined)
  return {
    ok: false,
    status: idpStatus || legacyStatus,
    error: morningMsg ? `אימות נכשל מול מורנינג. ${hint} (${morningMsg})` : `אימות נכשל מול מורנינג. ${hint}`,
    errorCode,
  }
}

async function greenInvoiceFetch<T>(
  credentials: GreenInvoiceCredentials,
  token: string,
  path: string,
  options: GreenInvoiceRequestOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; errorCode?: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (options.businessId) {
    headers['X-Business-Id'] = options.businessId
  }

  const init: RequestInit = { method: options.method ?? 'GET', headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const res = await fetchWithTimeout(
    `${baseUrl(credentials.env)}${path}`,
    init,
    API_TIMEOUT_MS
  )

  if (!res) {
    return { ok: false, status: 0, error: 'פסק זמן בחיבור ל-Morning' }
  }

  const data = await parseJsonBody<T & GreenInvoiceApiError>(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: formatApiError(data, `שגיאת API (${res.status})`),
      errorCode: data?.errorCode,
    }
  }

  return { ok: true, data: data as T }
}

function mapBusinessList(raw: unknown): GreenInvoiceBusinessSummary[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as { id?: string; name?: string; title?: string }
      const id = r.id?.trim()
      const name = (r.name || r.title || '').trim()
      if (!id || !name) return null
      return { id, name }
    })
    .filter((x): x is GreenInvoiceBusinessSummary => x !== null)
}

function mapSingleBusiness(raw: unknown): GreenInvoiceBusinessSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { id?: string; name?: string; title?: string }
  const id = r.id?.trim()
  const name = (r.name || r.title || '').trim()
  if (!id || !name) return null
  return { id, name }
}

/** List businesses + current business — used by settings "test connection". */
export async function testGreenInvoiceConnection(
  credentials: GreenInvoiceCredentials
): Promise<GreenInvoiceConnectionTestResult> {
  const tokenResult = await obtainGreenInvoiceToken(credentials)
  if (!tokenResult.ok) {
    return {
      ok: false,
      businesses: [],
      currentBusiness: null,
      error: tokenResult.error,
      errorCode: tokenResult.errorCode,
    }
  }

  const businessHeader = credentials.businessId ?? undefined

  const [listRes, currentRes] = await Promise.all([
    greenInvoiceFetch<unknown>(credentials, tokenResult.token, '/businesses', {
      businessId: businessHeader,
    }),
    greenInvoiceFetch<unknown>(credentials, tokenResult.token, '/businesses/me', {
      businessId: businessHeader,
    }),
  ])

  if (!listRes.ok) {
    return {
      ok: false,
      businesses: [],
      currentBusiness: null,
      error: listRes.error,
      errorCode: listRes.errorCode,
    }
  }

  const businesses = mapBusinessList(listRes.data)
  const currentBusiness = currentRes.ok ? mapSingleBusiness(currentRes.data) : null

  return { ok: true, businesses, currentBusiness }
}

export type GreenInvoicePaymentFormRequest = {
  description: string
  amount: number
  currency?: string
  client?: {
    name: string
    emails?: string[]
    phone?: string
    add?: boolean
  }
  successUrl?: string | null
  failureUrl?: string | null
  /** Morning payment form notify callback (webhook). */
  notifyUrl?: string | null
}

export type GreenInvoicePaymentFormResult = {
  url?: string
  paymentId?: string
}

/** Get hosted payment form URL — requires active clearing plugin in Morning account. */
export async function getGreenInvoicePaymentForm(
  credentials: GreenInvoiceCredentials,
  request: GreenInvoicePaymentFormRequest
): Promise<{ ok: true; data: GreenInvoicePaymentFormResult } | { ok: false; error: string }> {
  const tokenResult = await obtainGreenInvoiceToken(credentials)
  if (!tokenResult.ok) {
    return { ok: false, error: tokenResult.error }
  }

  const body: Record<string, unknown> = {
    description: request.description,
    amount: request.amount,
    currency: request.currency ?? 'ILS',
    lang: 'he',
  }
  if (request.client) body.client = request.client
  if (request.successUrl) body.successUrl = request.successUrl
  if (request.failureUrl) body.failureUrl = request.failureUrl
  if (request.notifyUrl) body.notifyUrl = request.notifyUrl

  const res = await greenInvoiceFetch<GreenInvoicePaymentFormResult>(
    credentials,
    tokenResult.token,
    '/payments/form',
    {
      method: 'POST',
      body,
      businessId: credentials.businessId,
    }
  )

  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, data: res.data }
}
