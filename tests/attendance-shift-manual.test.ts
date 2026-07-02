import { describe, expect, it } from 'vitest'
import { buildManualShiftRow } from '@/lib/attendance-shift-manual'

describe('buildManualShiftRow', () => {
  it('creates closed shift from times', () => {
    const row = buildManualShiftRow({
      started_at: '2026-01-01T08:00:00.000Z',
      ended_at: '2026-01-01T16:00:00.000Z',
    })
    expect(row.status).toBe('edited')
    expect(row.total_minutes).toBe(480)
    expect(row.ended_at).toBe('2026-01-01T16:00:00.000Z')
  })

  it('creates open shift when no end time', () => {
    const row = buildManualShiftRow({
      started_at: '2026-01-01T08:00:00.000Z',
    })
    expect(row.status).toBe('open')
    expect(row.ended_at).toBeNull()
    expect(row.total_minutes).toBeNull()
  })

  it('uses total_minutes override', () => {
    const row = buildManualShiftRow({
      started_at: '2026-01-01T08:00:00.000Z',
      total_minutes: 300,
    })
    expect(row.total_minutes).toBe(300)
    expect(row.ended_at).toBe('2026-01-01T13:00:00.000Z')
    expect(row.status).toBe('edited')
  })
})
