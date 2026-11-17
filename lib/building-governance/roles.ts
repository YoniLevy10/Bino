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

export const VOTE_CHOICES = ['approve', 'oppose', 'abstain'] as const
export type VoteChoice = (typeof VOTE_CHOICES)[number]

export const VOTE_CHOICE_LABELS_HE: Record<VoteChoice, string> = {
  approve: 'בעד',
  oppose: 'נגד',
  abstain: 'נמנע',
}

/** Legacy signed rows with NULL vote_choice count as approve. */
export function normalizeVoteChoice(choice: string | null | undefined): VoteChoice {
  if (choice === 'oppose' || choice === 'abstain' || choice === 'approve') return choice
  return 'approve'
}

export function isApproveVote(choice: string | null | undefined): boolean {
  return normalizeVoteChoice(choice) === 'approve'
}

export function countVoteChoices(
  rows: Array<{ status: string; vote_choice?: string | null }>
): { approve: number; oppose: number; abstain: number; signed: number } {
  let approve = 0
  let oppose = 0
  let abstain = 0
  let signed = 0
  for (const row of rows) {
    if (row.status !== 'signed') continue
    signed += 1
    const choice = normalizeVoteChoice(row.vote_choice)
    if (choice === 'oppose') oppose += 1
    else if (choice === 'abstain') abstain += 1
    else approve += 1
  }
  return { approve, oppose, abstain, signed }
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

/**
 * Majority progress vs eligible/threshold.
 * Counts **approve** only (oppose/abstain do not support).
 * `signedCount` kept as alias for approveCount (backward compat).
 */
export function computeMajorityProgress(opts: {
  approveCount?: number
  /** @deprecated Prefer approveCount — treated as approve when approveCount omitted. */
  signedCount?: number
  requiredSignatures: number
  majorityThreshold: number
}): { pct: number; reached: boolean; need: number; approveCount: number } {
  const required = Math.max(1, opts.requiredSignatures)
  const need = Math.ceil(required * opts.majorityThreshold)
  const approveCount = Math.max(0, opts.approveCount ?? opts.signedCount ?? 0)
  const pct = Math.min(100, Math.round((approveCount / need) * 100))
  return { pct, reached: approveCount >= need, need, approveCount }
}
