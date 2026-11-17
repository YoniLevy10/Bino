export type GrowEnv = 'sandbox' | 'production'

export const GROW_API_BASE_URLS: Record<GrowEnv, string> = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
}

/**
 * Audit #33: only explicit sandbox selects sandbox.
 * Unknown / typo values throw in non-production and refuse silent production fallback
 * when GROW_ENV is set but not recognized.
 */
export function parseGrowEnv(raw: string | null | undefined): GrowEnv {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return 'production'
  if (v === 'sandbox' || v === 'sand-box' || v === 'test') return 'sandbox'
  if (v === 'production' || v === 'prod' || v === 'live') return 'production'
  throw new Error(
    `Invalid GROW_ENV="${raw}". Use "sandbox" or "production" (refusing ambiguous value).`
  )
}

export function growApiBaseUrl(env: GrowEnv = 'production'): string {
  return GROW_API_BASE_URLS[env]
}

/** Platform credentials — Bino as the system. Per-tenant merchant is grow_user_id. */
export type GrowPlatformConfig = {
  env: GrowEnv
  /** Body field `apiKey` on Grow light API calls. */
  apiKey: string
  /**
   * HTTP header `x-api-key`. Grow issues this separately from body `apiKey`
   * (see payment-link docs from Grow onboarding).
   */
  xApiKey: string
  /** Payment-link pageCode (דרישת תשלום). */
  pageCode: string
  /**
   * SDK wallet pageCode. Falls back to pageCode when Grow issued one code for both
   * (sandbox from Lial used the same value for wallet + payment-link).
   */
  walletPageCode: string
  webhookSecret: string
}

export function readGrowPlatformConfig(): GrowPlatformConfig | null {
  // Staging mock mode: refuse Grow entirely (no charges). Sandbox keys OK when mode=sandbox.
  try {
    // Lazy require-style import avoided; inline env check keeps this module free of cycles.
    const mode = (process.env.BINO_OUTBOUND_MODE || '').trim().toLowerCase()
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase()
    const stagingHost = appUrl.includes('staging.bino.casa') || appUrl.includes('://staging.')
    if (mode === 'mock' || (stagingHost && mode !== 'sandbox' && mode !== 'live')) {
      return null
    }
  } catch {
    // ignore
  }

  const apiKey = (process.env.GROW_API_KEY || '').trim()
  // Prefer dedicated header secret; fall back only if Grow reuses the body key.
  const xApiKey = (process.env.GROW_X_API_KEY || process.env.GROW_API_KEY || '').trim()
  const pageCode = (process.env.GROW_PAGE_CODE || '').trim()
  const walletPageCode = (process.env.GROW_WALLET_PAGE_CODE || pageCode).trim()
  const webhookSecret = (process.env.GROW_WEBHOOK_SECRET || '').trim()
  if (!apiKey || !xApiKey || !pageCode || !webhookSecret) return null
  const env = parseGrowEnv(process.env.GROW_ENV)
  // Staging / non-live must never select Grow production endpoints.
  const forcedSandbox =
    (process.env.BINO_OUTBOUND_MODE || '').trim().toLowerCase() === 'sandbox' ||
    (process.env.NEXT_PUBLIC_APP_URL || '').toLowerCase().includes('staging.bino.casa')
  return {
    env: forcedSandbox ? 'sandbox' : env,
    apiKey,
    xApiKey,
    pageCode,
    walletPageCode,
    webhookSecret,
  }
}

export function isGrowPlatformConfigured(): boolean {
  return readGrowPlatformConfig() != null
}

/** GetLink / merchant registration (separate Grow register API). */
export type GrowRegisterConfig = {
  env: GrowEnv
  xApiKey: string
  marketer: string
  priceQuote: string
  /** Test:1 / Live:0 unless Grow says otherwise. */
  isDirectDebit: 0 | 1
  baseUrl: string
}

export function readGrowRegisterConfig(): GrowRegisterConfig | null {
  const xApiKey = (process.env.GROW_REGISTER_X_API_KEY || '').trim()
  const marketer = (process.env.GROW_MARKETER || '').trim()
  const priceQuote = (process.env.GROW_PRICE_QUOTE || '').trim()
  if (!xApiKey || !marketer || !priceQuote) return null
  const env = parseGrowEnv(process.env.GROW_ENV)
  const baseUrl =
    (process.env.GROW_REGISTER_BASE_URL || '').trim() ||
    (env === 'sandbox'
      ? 'https://devregisterapi.meshulam.co.il'
      : 'https://registerapi.meshulam.co.il')
  const debitRaw = (process.env.GROW_REGISTER_IS_DIRECT_DEBIT || '').trim()
  const isDirectDebit: 0 | 1 =
    debitRaw === '0' || debitRaw === '1'
      ? (Number(debitRaw) as 0 | 1)
      : env === 'sandbox'
        ? 1
        : 0
  return { env, xApiKey, marketer, priceQuote, isDirectDebit, baseUrl }
}

export function isGrowRegisterConfigured(): boolean {
  return readGrowRegisterConfig() != null
}

/**
 * Opt-in for Grow `/getTransactionInfo` client (ops / reconciliation).
 * Default off — do not enable in production until Grow confirms pageCode access
 * and Bino has regression coverage for any webhook use.
 */
export function isGrowGetTransactionInfoEnabled(
  raw: string | null | undefined = process.env.GROW_GET_TRANSACTION_INFO_ENABLED
): boolean {
  const v = (raw || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function growSdkEnvironment(env: GrowEnv = parseGrowEnv(process.env.GROW_ENV)): 'DEV' | 'PRODUCTION' {
  return env === 'sandbox' ? 'DEV' : 'PRODUCTION'
}

/** Grow rejects many symbols in form fields. */
export function sanitizeGrowPlainText(value: string, maxLen = 80): string {
  return value
    .replace(/[<>"'#?&\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}
