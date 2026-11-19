/**
 * PalGate / parking pilot — hard-scoped to the Savion (OpsBrain) demo client only.
 * Do not broaden without an explicit owner decision + PAL commercial path.
 */

/** OpsBrain / Savion demo tenant — see docs/OPSBRAIN_DEMO.md */
export const SAVION_PALGATE_PILOT_CLIENT_ID =
  '07773bb3-4969-4bce-8ce2-faab3b26383c' as const

export const PARKING_NAV_FEATURE_ID = 'parking' as const

/**
 * Optional override via env (exact UUID). Defaults to Savion.
 * Never use this to enable other tenants without owner approval.
 */
export function resolvePalGatePilotClientId(): string {
  const override = (process.env.PALGATE_PILOT_CLIENT_ID || '').trim()
  return override || SAVION_PALGATE_PILOT_CLIENT_ID
}

export function isPalGatePilotClient(clientId: string | null | undefined): boolean {
  const id = typeof clientId === 'string' ? clientId.trim() : ''
  if (!id) return false
  return id === resolvePalGatePilotClientId()
}
