import { computeShiftTotalMinutes } from '@/lib/attendance-shift-patch'

export type ManualShiftInput = {
  started_at: string
  ended_at?: string | null
  total_minutes?: number
  status?: string
  admin_note?: string | null
}

export type ManualShiftRow = {
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  status: string
  admin_note: string | null
  start_source: 'online'
  end_source: 'online' | null
}

/** Normalize manager-created shift fields before DB insert/update. */
export function buildManualShiftRow(input: ManualShiftInput): ManualShiftRow {
  const started_at = input.started_at
  let ended_at = input.ended_at ?? null

  if (input.total_minutes !== undefined) {
    const startMs = new Date(started_at).getTime()
    if (!Number.isFinite(startMs)) throw new Error('זמן כניסה לא תקין')
    ended_at = new Date(startMs + input.total_minutes * 60_000).toISOString()
  }

  const total_minutes =
    input.total_minutes !== undefined
      ? input.total_minutes
      : ended_at
        ? computeShiftTotalMinutes(started_at, ended_at)
        : null

  let status = input.status
  if (!status) {
    status = ended_at ? 'edited' : 'open'
  }
  if (status === 'open' && ended_at) {
    status = 'closed'
  }

  return {
    started_at,
    ended_at,
    total_minutes,
    status,
    admin_note: input.admin_note ?? null,
    start_source: 'online',
    end_source: ended_at ? 'online' : null,
  }
}
