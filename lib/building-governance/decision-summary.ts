/**
 * Manager/vaad decision summary — tallies, threshold progress, signers, audit refs.
 * Pure helpers (no DB). Signed without vote_choice counts as approve (compat).
 */

import { computeMajorityProgress, DECISION_STATUS_LABELS_HE } from '@/lib/building-governance/roles'

export const VOTE_CHOICES = ['approve', 'oppose', 'abstain'] as const
export type VoteChoice = (typeof VOTE_CHOICES)[number]

export const VOTE_CHOICE_LABELS_HE: Record<VoteChoice, string> = {
  approve: 'בעד',
  oppose: 'נגד',
  abstain: 'נמנע',
}

export type DecisionSummarySigner = {
  id: string
  signer_name: string
  signer_phone: string | null
  resident_id: string | null
  status: string
  vote_choice: VoteChoice | null
  /** Effective choice used in tallies (signed + null → approve). */
  effective_choice: VoteChoice | null
  signed_at: string | null
  created_at: string
}

export type DecisionSummaryAuditRef = {
  id: string
  action: string
  created_at: string
  user_id: string | null
}

export type DecisionVoteTallies = {
  approve: number
  oppose: number
  abstain: number
  pending: number
  signed_total: number
}

export type DecisionSummaryPayload = {
  decision_id: string
  project_id: string
  project_name: string
  title: string
  body: string | null
  status: string
  status_label_he: string
  majority_threshold: number
  required_signatures: number
  votes: DecisionVoteTallies
  /** Majority uses approve count vs required × threshold (oppose/abstain do not help pass). */
  majority_pct: number
  majority_reached: boolean
  majority_need: number
  created_at: string
  closed_at: string | null
  generated_at: string
  pdf: {
    document_id: string | null
    file_name: string | null
    download_url: string | null
  }
  signers: DecisionSummarySigner[]
  audit_refs: DecisionSummaryAuditRef[]
  /** Meta UTILITY HSM not yet catalogued for governance reminders. */
  wa_hsm_note_he: string
}

export const GOVERNANCE_WA_HSM_NOTE_HE =
  'WhatsApp חופשי מחוץ לחלון 24 שעות דורש תבנית UTILITY מאושרת ב־Meta (HSM). ' +
  'אין כרגע תבנית governance בקטלוג — תזכורות נשלחות ב־SMS/אימייל; WA רק בתוך session פעיל.'

/** Normalize stored vote_choice; signed+null → approve. */
export function effectiveVoteChoice(opts: {
  status: string
  vote_choice?: string | null
}): VoteChoice | null {
  if (opts.status !== 'signed') return null
  const raw = (opts.vote_choice || '').trim().toLowerCase()
  if (raw === 'oppose' || raw === 'abstain' || raw === 'approve') return raw
  return 'approve'
}

export function tallyDecisionVotes(
  rows: Array<{ status: string; vote_choice?: string | null }>
): DecisionVoteTallies {
  const tallies: DecisionVoteTallies = {
    approve: 0,
    oppose: 0,
    abstain: 0,
    pending: 0,
    signed_total: 0,
  }
  for (const row of rows) {
    if (row.status === 'pending') {
      tallies.pending += 1
      continue
    }
    if (row.status !== 'signed') continue
    tallies.signed_total += 1
    const choice = effectiveVoteChoice(row)
    if (choice === 'oppose') tallies.oppose += 1
    else if (choice === 'abstain') tallies.abstain += 1
    else tallies.approve += 1
  }
  return tallies
}

export function majorityNeed(requiredSignatures: number, majorityThreshold: number): number {
  const required = Math.max(1, requiredSignatures)
  return Math.ceil(required * majorityThreshold)
}

export function buildDecisionSummaryPayload(opts: {
  decision: {
    id: string
    project_id: string
    title: string
    body: string | null
    status: string
    majority_threshold: number
    required_signatures: number
    created_at: string
    closed_at: string | null
    document_id?: string | null
  }
  projectName: string
  signatures: Array<{
    id: string
    signer_name: string
    signer_phone: string | null
    resident_id: string | null
    status: string
    vote_choice?: string | null
    signed_at: string | null
    created_at: string
  }>
  auditRefs: DecisionSummaryAuditRef[]
  pdf?: {
    document_id: string | null
    file_name: string | null
    download_url: string | null
  }
  generatedAt?: string
}): DecisionSummaryPayload {
  const votes = tallyDecisionVotes(opts.signatures)
  const threshold = Number(opts.decision.majority_threshold)
  const need = majorityNeed(opts.decision.required_signatures, threshold)
  const progress = computeMajorityProgress({
    signedCount: votes.approve,
    requiredSignatures: opts.decision.required_signatures,
    majorityThreshold: threshold,
  })

  const signers: DecisionSummarySigner[] = opts.signatures.map((s) => {
    const effective = effectiveVoteChoice(s)
    return {
      id: s.id,
      signer_name: s.signer_name,
      signer_phone: s.signer_phone,
      resident_id: s.resident_id,
      status: s.status,
      vote_choice:
        s.vote_choice === 'approve' || s.vote_choice === 'oppose' || s.vote_choice === 'abstain'
          ? s.vote_choice
          : null,
      effective_choice: effective,
      signed_at: s.signed_at,
      created_at: s.created_at,
    }
  })

  return {
    decision_id: opts.decision.id,
    project_id: opts.decision.project_id,
    project_name: opts.projectName,
    title: opts.decision.title,
    body: opts.decision.body,
    status: opts.decision.status,
    status_label_he: DECISION_STATUS_LABELS_HE[opts.decision.status] || opts.decision.status,
    majority_threshold: threshold,
    required_signatures: opts.decision.required_signatures,
    votes,
    majority_pct: progress.pct,
    majority_reached: progress.reached,
    majority_need: need,
    created_at: opts.decision.created_at,
    closed_at: opts.decision.closed_at,
    generated_at: opts.generatedAt ?? new Date().toISOString(),
    pdf: opts.pdf ?? {
      document_id: opts.decision.document_id ?? null,
      file_name: null,
      download_url: null,
    },
    signers,
    audit_refs: opts.auditRefs,
    wa_hsm_note_he: GOVERNANCE_WA_HSM_NOTE_HE,
  }
}
