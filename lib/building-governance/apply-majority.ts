import type { SupabaseClient } from '@supabase/supabase-js'
import { computeMajorityProgress } from '@/lib/building-governance/roles'

/**
 * Recount signed stubs for a decision; mark `passed` when majority threshold is met.
 * Safe to call after any signature write (public token or resident portal).
 */
export async function applyDecisionMajorityIfReached(
  admin: SupabaseClient,
  opts: {
    decisionId: string
    clientId: string
    now?: string
  }
): Promise<{ passed: boolean; signedCount: number }> {
  const now = opts.now ?? new Date().toISOString()

  const { data: decision } = await admin
    .from('building_decisions')
    .select('id, status, majority_threshold, required_signatures')
    .eq('id', opts.decisionId)
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (!decision || (decision.status !== 'open' && decision.status !== 'draft')) {
    return { passed: false, signedCount: 0 }
  }

  const { count } = await admin
    .from('building_signature_requests')
    .select('id', { count: 'exact', head: true })
    .eq('decision_id', opts.decisionId)
    .eq('client_id', opts.clientId)
    .eq('status', 'signed')

  const signedCount = count ?? 0
  const progress = computeMajorityProgress({
    signedCount,
    requiredSignatures: decision.required_signatures,
    majorityThreshold: Number(decision.majority_threshold),
  })

  if (!progress.reached) {
    return { passed: false, signedCount }
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

  return { passed: true, signedCount }
}
