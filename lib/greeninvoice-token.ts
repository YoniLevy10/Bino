/** Parse Morning token JSON and format auth errors without logging secrets. */

export type GreenInvoiceParsedToken = {
  token: string
  expires: number
}

type TokenJson = Record<string, unknown>

function asRecord(data: unknown): TokenJson | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as TokenJson
}

function pickString(data: TokenJson, keys: string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function unixSecondsFromExpires(data: TokenJson): number {
  if (typeof data.expires === 'number' && Number.isFinite(data.expires) && data.expires > 0) {
    return Math.floor(data.expires)
  }

  const expiresAt = pickString(data, ['expiresAt', 'expires_at'])
  if (expiresAt) {
    const ms = Date.parse(expiresAt)
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000)
  }

  const expiresIn = data.expires_in ?? data.expiresIn
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
    return Math.floor(Date.now() / 1000) + Math.floor(expiresIn)
  }

  return Math.floor(Date.now() / 1000) + 55 * 60
}

/** Accepts OAuth (`accessToken`) and retired `/account/token` (`token`) shapes. */
export function parseGreenInvoiceTokenResponse(data: unknown): GreenInvoiceParsedToken | null {
  const rec = asRecord(data)
  if (!rec) return null
  const token = pickString(rec, ['accessToken', 'access_token', 'token'])
  if (!token) return null
  return { token, expires: unixSecondsFromExpires(rec) }
}

export function formatGreenInvoiceAuthError(data: unknown): string | null {
  const rec = asRecord(data)
  if (!rec) return null

  const message = pickString(rec, ['errorMessage', 'error_description', 'message'])
  if (message) return message

  const code = pickString(rec, ['error'])
  if (code === 'invalid_client') return 'מפתח או סוד שגויים'
  if (code) return code
  return null
}

/** Prefer a vendor Hebrew/description string over a mapped OAuth code. */
export function pickGreenInvoiceAuthMessage(...payloads: unknown[]): string | null {
  for (const data of payloads) {
    const rec = asRecord(data)
    if (!rec) continue
    const message = pickString(rec, ['errorMessage', 'error_description', 'message'])
    if (message) return message
  }
  for (const data of payloads) {
    const mapped = formatGreenInvoiceAuthError(data)
    if (mapped) return mapped
  }
  return null
}

/** Fields safe to print — never includes client_id / secret / tokens. */
export function safeGreenInvoiceAuthLog(data: unknown): Record<string, unknown> | null {
  const rec = asRecord(data)
  if (!rec) return null
  const out: Record<string, unknown> = {}
  for (const key of ['error', 'errorCode', 'errorMessage', 'error_description', 'message']) {
    if (rec[key] !== undefined) out[key] = rec[key]
  }
  return Object.keys(out).length > 0 ? out : null
}

export function morningAuthEnvHint(env: 'sandbox' | 'production'): string {
  return env === 'sandbox'
    ? 'בדקו שהמפתח הוא מארגז החול (לא ייצור) ושמזהה המפתח הוא UUID ולא כתובת אתר.'
    : 'בדקו שהמפתח הוא מחשבון הייצור (לא ארגז חול) ושמזהה המפתח הוא UUID ולא כתובת אתר.'
}
