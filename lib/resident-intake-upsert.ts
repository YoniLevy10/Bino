/**
 * Upsert helpers for public resident intake (/intake → POST /api/public/resident-intake).
 * Dedupes by (client_id, normalized_phone); prefers same-project rows; revives soft-deletes.
 */

export type IntakeResidentRow = {
  id: string
  project_id: string
  deleted_at: string | null
}

export type IntakeUpsertDecision =
  | { action: 'update'; residentId: string; revive: boolean }
  | { action: 'insert' }
  | {
      action: 'conflict_other_project'
      residentId: string
      otherProjectId: string
    }

/**
 * Decide how to apply an intake submission given existing rows for the same phone.
 * `candidates` = all residents for this client_id + normalized_phone (active + soft-deleted).
 */
export function decideResidentIntakeUpsert(params: {
  targetProjectId: string
  candidates: IntakeResidentRow[]
}): IntakeUpsertDecision {
  const { targetProjectId, candidates } = params
  if (!candidates.length) return { action: 'insert' }

  const sameProjectActive = candidates.find(
    (r) => r.project_id === targetProjectId && r.deleted_at == null
  )
  if (sameProjectActive) {
    return { action: 'update', residentId: sameProjectActive.id, revive: false }
  }

  const sameProjectDeleted = candidates.find(
    (r) => r.project_id === targetProjectId && r.deleted_at != null
  )
  if (sameProjectDeleted) {
    return { action: 'update', residentId: sameProjectDeleted.id, revive: true }
  }

  const otherActive = candidates.find((r) => r.project_id !== targetProjectId && r.deleted_at == null)
  if (otherActive) {
    return {
      action: 'conflict_other_project',
      residentId: otherActive.id,
      otherProjectId: otherActive.project_id,
    }
  }

  // Soft-deleted in another project: revive and move into the intake project.
  const otherDeleted = candidates.find((r) => r.project_id !== targetProjectId && r.deleted_at != null)
  if (otherDeleted) {
    return { action: 'update', residentId: otherDeleted.id, revive: true }
  }

  return { action: 'insert' }
}

export function isPostgresUniqueViolation(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}
