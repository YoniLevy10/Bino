import { describe, it, expect } from 'vitest'
import { normalizeLocalAttendanceState } from '@/lib/attendance-client'

describe('attendance-client local state', () => {
  it('clears stale open shift after 10 hours offline', () => {
    const started = new Date(Date.now() - 11 * 3_600_000).toISOString()
    const next = normalizeLocalAttendanceState({
      has_open_shift: true,
      open_shift_id: 'local',
      last_event_type: 'clock_in',
      last_event_at: started,
      last_tag_code: 'OFFICE1',
    })
    expect(next?.has_open_shift).toBe(false)
    expect(next?.open_shift_id).toBeNull()
  })

  it('keeps fresh open shift', () => {
    const started = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const state = {
      has_open_shift: true,
      open_shift_id: 'local',
      last_event_type: 'clock_in' as const,
      last_event_at: started,
      last_tag_code: 'OFFICE1',
    }
    expect(normalizeLocalAttendanceState(state)).toEqual(state)
  })
})
