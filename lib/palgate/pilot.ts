/**
 * PalGate / parking pilot — hard-scoped to known pilot tenants only.
 * Do not broaden beyond this allowlist without an explicit owner decision + PAL commercial path.
 */

/** OpsBrain / Savion demo tenant — see docs/OPSBRAIN_DEMO.md */
export const SAVION_PALGATE_PILOT_CLIENT_ID =
  '07773bb3-4969-4bce-8ce2-faab3b26383c' as const

/**
 * Bamakor production tenant — owner daily-driver; same PalGate pilot UI as Savion.
 * Open-gate still requires PalGate secrets in Vercel.
 */
export const BAMAKOR_PALGATE_PILOT_CLIENT_ID =
  '7573f5ad-70e5-4357-8fef-1d96ec38d169' as const

/** Default pilot tenants (Savion demo + Bamakor prod). */
export const DEFAULT_PALGATE_PILOT_CLIENT_IDS: readonly string[] = [
  SAVION_PALGATE_PILOT_CLIENT_ID,
  BAMAKOR_PALGATE_PILOT_CLIENT_ID,
]

export const PARKING_NAV_FEATURE_ID = 'parking' as const

/**
 * Optional override via env: one UUID, or comma-separated UUIDs.
 * When set, replaces the default allowlist (does not merge).
 * Never use this to enable arbitrary tenants without owner approval.
 */
export function resolvePalGatePilotClientIds(): string[] {
  const override = (process.env.PALGATE_PILOT_CLIENT_ID || '').trim()
  if (!override) return [...DEFAULT_PALGATE_PILOT_CLIENT_IDS]
  const ids = override
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length > 0 ? ids : [...DEFAULT_PALGATE_PILOT_CLIENT_IDS]
}

/** @deprecated Prefer resolvePalGatePilotClientIds — kept for call sites expecting a single id. */
export function resolvePalGatePilotClientId(): string {
  return resolvePalGatePilotClientIds()[0] ?? SAVION_PALGATE_PILOT_CLIENT_ID
}

export function isPalGatePilotClient(clientId: string | null | undefined): boolean {
  const id = typeof clientId === 'string' ? clientId.trim() : ''
  if (!id) return false
  return resolvePalGatePilotClientIds().includes(id)
}
