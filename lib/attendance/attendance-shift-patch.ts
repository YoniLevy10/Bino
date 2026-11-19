export function computeShiftTotalMinutes(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null
  const a = new Date(startedAt).getTime()
  const b = new Date(endedAt).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 60_000)
}

export type ShiftPatchInput = {
  started_at?: string
  ended_at?: string | null
  total_minutes?: number
  status?: string
  admin_note?: string | null
}

export type ExistingShift = {
  started_at: string
  ended_at: string | null
  status: string
}

/** Build DB patch fields for manager shift edit. */
export function buildManagerShiftPatch(
  existing: ExistingShift,
  input: ShiftPatchInput
): Record<string, unknown> {
  const started_at = input.started_at ?? existing.started_at
  let ended_at =
    input.ended_at !== undefined ? input.ended_at : (existing.ended_at ?? null)

  const patch: Record<string, unknown> = {}

  if (input.started_at) patch.started_at = input.started_at
  if (input.admin_note !== undefined) patch.admin_note = input.admin_note

  const timeFieldsTouched =
    input.started_at !== undefined ||
    input.ended_at !== undefined ||
    input.total_minutes !== undefined

  if (input.total_minutes !== undefined) {
    const startMs = new Date(started_at).getTime()
    if (!Number.isFinite(startMs)) {
      throw new Error('זמן כניסה לא תקין')
    }
    ended_at = new Date(startMs + input.total_minutes * 60_000).toISOString()
    patch.ended_at = ended_at
    patch.total_minutes = input.total_minutes
  } else {
    if (input.ended_at !== undefined) patch.ended_at = input.ended_at
    if (ended_at) {
      patch.total_minutes = computeShiftTotalMinutes(started_at, ended_at)
    }
  }

  if (input.status) {
    patch.status = input.status
  } else if (timeFieldsTouched) {
    const prevStatus = existing.status
    if (prevStatus === 'open' && ended_at) {
      patch.status = 'closed'
    } else if (prevStatus !== 'open') {
      patch.status = 'edited'
    }
  }

  return patch
}
