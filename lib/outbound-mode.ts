/**
 * Staging / sandbox outbound gate.
 *
 * BINO_OUTBOUND_MODE:
 *   - mock     → never call SMS / WhatsApp / Resend / live Grow; log only
 *   - sandbox  → allow Grow sandbox + demo-safe phones only; no prod SMS/WA tokens expected
 *   - live     → production behavior (default when unset on production)
 *
 * Also treats custom Staging host / NEXT_PUBLIC_APP_URL containing "staging." as non-live
 * unless explicitly overridden with BINO_OUTBOUND_MODE=live (never set that on staging).
 */

export type OutboundMode = 'mock' | 'sandbox' | 'live'

function readExplicitMode(): OutboundMode | null {
  const raw = (process.env.BINO_OUTBOUND_MODE || '').trim().toLowerCase()
  if (raw === 'mock' || raw === 'sandbox' || raw === 'live') return raw
  return null
}

function appUrlLooksLikeStaging(): boolean {
  const url = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .trim()
    .toLowerCase()
  if (!url) return false
  try {
    const host = new URL(url.includes('://') ? url : `https://${url}`).hostname
    return host === 'staging.bino.casa' || host.startsWith('staging.')
  } catch {
    return url.includes('staging.bino.casa') || url.includes('://staging.')
  }
}

/** True when this deployment is the dedicated Staging custom environment / host. */
export function isStagingRuntime(): boolean {
  if (appUrlLooksLikeStaging()) return true
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  // Custom environments often report as "preview" — rely on APP_URL + explicit mode.
  if (vercelEnv === 'preview' && readExplicitMode() === 'mock') return true
  return false
}

export function getOutboundMode(): OutboundMode {
  const explicit = readExplicitMode()
  if (explicit) return explicit
  if (isStagingRuntime()) return 'mock'
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  if (vercelEnv === 'preview' || vercelEnv === 'development') return 'sandbox'
  if (process.env.NODE_ENV !== 'production') return 'sandbox'
  return 'live'
}

/** When false, SMS / WhatsApp / email providers must not be called. */
export function isOutboundLiveAllowed(): boolean {
  return getOutboundMode() === 'live'
}

/** Grow may run only in live or sandbox mode (never mock). */
export function isGrowOutboundAllowed(): boolean {
  const mode = getOutboundMode()
  return mode === 'live' || mode === 'sandbox'
}

export function outboundMockResult(channel: string, detail?: Record<string, unknown>): {
  ok: true
  mocked: true
} {
  console.log('🛡️ OUTBOUND_MOCK', { channel, mode: getOutboundMode(), ...detail })
  return { ok: true, mocked: true }
}
