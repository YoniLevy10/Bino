import { normalizePhone019 } from '@/lib/sms-019-core'

/**
 * Feature flag for Hub / Finance / Governance auto-notify (SMS / WhatsApp / push).
 *
 * - Default ON when NODE_ENV === 'development' (private server) if env unset
 * - Explicit BUILDING_GOVERNANCE_AUTO_NOTIFY=true|1 enables (including production)
 * - Explicit false|0 disables even in development
 *
 * Never cold-spam sales leads. Service messages only.
 */
export function isBuildingGovernanceAutoNotifyEnabled(): boolean {
  const raw = (process.env.BUILDING_GOVERNANCE_AUTO_NOTIFY || '').trim()
  if (raw) {
    const lower = raw.toLowerCase()
    if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on') return true
    if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') return false
  }
  return process.env.NODE_ENV === 'development'
}

/**
 * Demo / QA seed phones (0500000xxx → 972500000xxx).
 * Used to avoid blasting real Bamakor numbers from localhost when AUTO_NOTIFY=true.
 */
export function isGovernanceDemoSafePhone(phone: string | null | undefined): boolean {
  const n = normalizePhone019((phone || '').trim())
  if (!n) return false
  // 0500000xxx / 05000002xx committee demo range
  return /^972500000\d{3}$/.test(n)
}

/**
 * Whether SMS/email delivery is allowed for this phone on the current runtime.
 * Production: any phone when AUTO_NOTIFY is on.
 * Local / preview / non-production: demo-safe phones only.
 */
export function isGovernanceOutboundPhoneAllowed(phone: string | null | undefined): boolean {
  if (!isBuildingGovernanceAutoNotifyEnabled()) return false
  if (!phone?.trim()) return false
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase()
  const outboundMode = (process.env.BINO_OUTBOUND_MODE || '').trim().toLowerCase()
  const isStagingHost =
    appUrl.includes('staging.bino.casa') || appUrl.includes('://staging.')
  // Staging / mock: never treat as production outbound, even if VERCEL_ENV is odd.
  if (isStagingHost || outboundMode === 'mock' || outboundMode === 'sandbox') {
    return isGovernanceDemoSafePhone(phone)
  }
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  const isProdRuntime =
    vercelEnv === 'production' ||
    (!vercelEnv && process.env.NODE_ENV === 'production')
  if (isProdRuntime) return true
  return isGovernanceDemoSafePhone(phone)
}
