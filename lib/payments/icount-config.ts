/**
 * Platform gate for direct iCount collections (VaadPay replacement for Grow).
 * Default OFF — Grow remains the live path until P0 IPN marks paid.
 */

type EnvLike = Record<string, string | undefined>

export function isIcountCollectionsPlatformEnabled(
  env: EnvLike = process.env
): boolean {
  const raw = (env.ICOUNT_COLLECTIONS_ENABLED || '').trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

export function readIcountWebhookSecret(env: EnvLike = process.env): string | null {
  const secret = (env.ICOUNT_WEBHOOK_SECRET || '').trim()
  return secret || null
}

export const ICOUNT_API_BASE = 'https://api.icount.co.il/api/v3.php'
