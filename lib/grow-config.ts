export type GrowEnv = 'sandbox' | 'production'

export const GROW_API_BASE_URLS: Record<GrowEnv, string> = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
}

export function parseGrowEnv(raw: string | null | undefined): GrowEnv {
  return raw === 'sandbox' ? 'sandbox' : 'production'
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
  const apiKey = (process.env.GROW_API_KEY || '').trim()
  // Prefer dedicated header secret; fall back only if Grow reuses the body key.
  const xApiKey = (process.env.GROW_X_API_KEY || process.env.GROW_API_KEY || '').trim()
  const pageCode = (process.env.GROW_PAGE_CODE || '').trim()
  const walletPageCode = (process.env.GROW_WALLET_PAGE_CODE || pageCode).trim()
  const webhookSecret = (process.env.GROW_WEBHOOK_SECRET || '').trim()
  if (!apiKey || !xApiKey || !pageCode || !webhookSecret) return null
  return {
    env: parseGrowEnv(process.env.GROW_ENV),
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
