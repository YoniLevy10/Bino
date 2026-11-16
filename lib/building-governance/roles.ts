export const COMMITTEE_ROLES = [
  'chair',
  'treasurer',
  'secretary',
  'member',
  'signer',
] as const

export type CommitteeRole = (typeof COMMITTEE_ROLES)[number]

export const COMMITTEE_ROLE_LABELS_HE: Record<CommitteeRole, string> = {
  chair: 'יו״ר',
  treasurer: 'גזבר',
  secretary: 'מזכיר',
  member: 'חבר ועד',
  signer: 'מורשה חתימה',
}

export const DECISION_STATUS_LABELS_HE: Record<string, string> = {
  draft: 'טיוטה',
  open: 'פתוחה לחתימות',
  passed: 'אושרה (רוב)',
  rejected: 'נדחתה',
  cancelled: 'בוטלה',
}

export function buildingSignPublicPath(token: string): string {
  return `/intake/building-sign/${encodeURIComponent(token.trim())}`
}

/** Authenticated resident portal path for decisions (primary UX). */
export function residentDecisionsPortalPath(opts?: { decisionId?: string | null }): string {
  const id = opts?.decisionId?.trim()
  if (id) return `/resident/decisions?decision=${encodeURIComponent(id)}`
  return '/resident/decisions'
}

/**
 * Deep link: join/login for the building, then land on decisions.
 * Residents enter with phone + SMS numeric password (OTP).
 */
export function residentDecisionInvitePath(
  projectId: string,
  opts?: { decisionId?: string | null }
): string {
  const next = residentDecisionsPortalPath({ decisionId: opts?.decisionId })
  const params = new URLSearchParams({ next })
  return `/resident/join/${encodeURIComponent(projectId.trim())}?${params.toString()}`
}

export function computeMajorityProgress(opts: {
  signedCount: number
  requiredSignatures: number
  majorityThreshold: number
}): { pct: number; reached: boolean } {
  const required = Math.max(1, opts.requiredSignatures)
  const need = Math.ceil(required * opts.majorityThreshold)
  const signed = Math.max(0, opts.signedCount)
  const pct = Math.min(100, Math.round((signed / need) * 100))
  return { pct, reached: signed >= need }
}
