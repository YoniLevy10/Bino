import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeResidentBoundSignedRows } from '@/lib/building-governance/eligible-voters'
import {
  computeMajorityProgress,
  countVoteChoices,
} from '@/lib/building-governance/roles'

/**
 * Recount resident-bound approve votes; mark `passed` when majority threshold is met.
 * - Only stubs with `resident_id` count (anonymous name-only stubs excluded).
 * - One vote per unit (dedupe); oppose/abstain do not support majority.
 * - NULL vote_choice = approve (compat with PR-H).
 */
export async function applyDecisionMajorityIfReached(
  admin: SupabaseClient,
  opts: {
    decisionId: string
    clientId: string
    now?: string
  }
): Promise<{ passed: boolean; signedCount: number; approveCount: number }> {
  const now = opts.now ?? new Date().toISOString()

  const { data: decision } = await admin
    .from('building_decisions')
    .select('id, status, majority_threshold, required_signatures')
    .eq('id', opts.decisionId)
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (!decision || (decision.status !== 'open' && decision.status !== 'draft')) {
    return { passed: false, signedCount: 0, approveCount: 0 }
  }

  const { data: sigRows } = await admin
    .from('building_signature_requests')
    .select('status, resident_id, unit_id, vote_choice')
    .eq('decision_id', opts.decisionId)
    .eq('client_id', opts.clientId)
    .eq('status', 'signed')
    .not('resident_id', 'is', null)
    .limit(500)

  const unique = dedupeResidentBoundSignedRows(
    (sigRows ?? []) as Array<{
      status: string
      resident_id: string | null
      unit_id: string | null
      vote_choice: string | null
    }>
  )
  const tallies = countVoteChoices(unique)
  const progress = computeMajorityProgress({
    approveCount: tallies.approve,
    requiredSignatures: decision.required_signatures,
    majorityThreshold: Number(decision.majority_threshold),
  })

  if (!progress.reached) {
    return {
      passed: false,
      signedCount: tallies.signed,
      approveCount: tallies.approve,
    }
  }

  await admin
    .from('building_decisions')
    .update({
      status: 'passed',
      closed_at: now,
      updated_at: now,
    })
    .eq('id', decision.id)
    .eq('client_id', opts.clientId)
    .in('status', ['open', 'draft'])

  return {
    passed: true,
    signedCount: tallies.signed,
    approveCount: tallies.approve,
  }
}
