import type { SupabaseClient } from '@supabase/supabase-js'

export type EligibleUnitResident = {
  unit_id: string | null
  deleted_at?: string | null
  is_renter?: boolean | null
}

export type SignedVoteStub = {
  status: string
  resident_id: string | null
  unit_id: string | null
  vote_choice?: string | null
}

/**
 * Eligible denominator: one vote per project unit that has at least one mapped
 * owner/resident (`residents.unit_id`). Pure helper for unit tests.
 */
export function computeEligibleVoterCount(
  unitIds: string[],
  residents: EligibleUnitResident[]
): number {
  const units = new Set(unitIds.filter(Boolean))
  if (units.size === 0) return 0
  const mapped = new Set<string>()
  for (const r of residents) {
    if (r.deleted_at) continue
    const uid = (r.unit_id || '').trim()
    if (!uid || !units.has(uid)) continue
    mapped.add(uid)
  }
  return mapped.size
}

/** One vote per unit (or resident when unit_id missing); require resident_id. */
export function dedupeResidentBoundSignedRows<T extends SignedVoteStub>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (r.status !== 'signed') continue
    const residentId = (r.resident_id || '').trim()
    if (!residentId) continue
    const unitId = (r.unit_id || '').trim()
    const key = unitId ? `u:${unitId}` : `r:${residentId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * Majority numerator stub count: only signed stubs bound to a resident_id.
 * One vote per unit when unit_id is set; otherwise one vote per resident_id.
 */
export function countResidentBoundSignedVotes(rows: SignedVoteStub[]): number {
  return dedupeResidentBoundSignedRows(rows).length
}

/** Load eligible voter count for a project (bounded selects). */
export async function loadEligibleVoterCount(
  admin: SupabaseClient,
  opts: { clientId: string; projectId: string }
): Promise<{
  eligibleCount: number
  unitCount: number
  mappedResidentCount: number
}> {
  const { data: units, error: uErr } = await admin
    .from('project_units')
    .select('id')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .limit(500)

  if (uErr) {
    throw new Error(uErr.message)
  }

  const unitIds = (units ?? []).map((u) => (u as { id: string }).id)
  if (unitIds.length === 0) {
    return { eligibleCount: 0, unitCount: 0, mappedResidentCount: 0 }
  }

  const { data: residents, error: rErr } = await admin
    .from('residents')
    .select('id, unit_id, is_renter, deleted_at')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .is('deleted_at', null)
    .not('unit_id', 'is', null)
    .limit(500)

  if (rErr) {
    throw new Error(rErr.message)
  }

  const residentRows = (residents ?? []) as EligibleUnitResident[]
  const eligibleCount = computeEligibleVoterCount(unitIds, residentRows)
  return {
    eligibleCount,
    unitCount: unitIds.length,
    mappedResidentCount: residentRows.length,
  }
}
