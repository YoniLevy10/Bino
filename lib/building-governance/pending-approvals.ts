import type { SupabaseClient } from '@supabase/supabase-js'

const PENDING_APPROVALS_CAP = 50

/**
 * Pure count helper — pending signature stubs for a resident on open decisions.
 * Used by unit tests and by the DB loader below.
 */
export function countPendingResidentApprovals(
  rows: Array<{ status: string; decision_status: string | null | undefined }>
): number {
  let n = 0
  for (const row of rows) {
    if (row.status !== 'pending') continue
    if (row.decision_status !== 'open') continue
    n++
  }
  return n
}

/**
 * Bounded loader: pending signature requests for this resident in this building
 * (project), only when the parent decision is still `open`.
 */
export async function loadPendingResidentApprovalsCount(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    residentId: string
    limit?: number
  }
): Promise<number> {
  const limit = Math.min(
    PENDING_APPROVALS_CAP,
    Math.max(1, opts.limit ?? PENDING_APPROVALS_CAP)
  )

  const { data: sigs, error: sigErr } = await admin
    .from('building_signature_requests')
    .select('id, decision_id, status')
    .eq('client_id', opts.clientId)
    .eq('resident_id', opts.residentId)
    .eq('status', 'pending')
    .limit(limit)

  if (sigErr || !sigs?.length) {
    return 0
  }

  const decisionIds = Array.from(
    new Set(
      (sigs as Array<{ decision_id: string }>).map((s) => s.decision_id).filter(Boolean)
    )
  )
  if (decisionIds.length === 0) return 0

  const { data: decisions, error: dErr } = await admin
    .from('building_decisions')
    .select('id, status')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .in('id', decisionIds)
    .eq('status', 'open')
    .limit(limit)

  if (dErr || !decisions?.length) {
    return 0
  }

  const openIds = new Set((decisions as Array<{ id: string }>).map((d) => d.id))
  return countPendingResidentApprovals(
    (sigs as Array<{ status: string; decision_id: string }>).map((s) => ({
      status: s.status,
      decision_status: openIds.has(s.decision_id) ? 'open' : null,
    }))
  )
}
