import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeMajorityProgress,
  countVoteChoices,
} from '@/lib/building-governance/roles'

/**
 * Recount approve votes for a decision; mark `passed` when majority threshold is met.
 * Oppose / abstain do not count toward majority. NULL vote_choice = approve (compat).
 * Safe to call after any signature write (public token or resident portal).
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

  const { data: signedRows } = await admin
    .from('building_signature_requests')
    .select('id, status, vote_choice')
    .eq('decision_id', opts.decisionId)
    .eq('client_id', opts.clientId)
    .eq('status', 'signed')
    .limit(500)

  const tallies = countVoteChoices(
    (signedRows ?? []) as Array<{ status: string; vote_choice: string | null }>
  )
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
