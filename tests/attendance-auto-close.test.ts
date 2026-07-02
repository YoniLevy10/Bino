import { describe, it, expect } from 'vitest'
import {
  ATTENDANCE_AUTO_CLOSE_HOURS,
  computeAutoCloseTimes,
  isShiftStaleForAutoClose,
} from '@/lib/attendance-auto-close'

describe('attendance-auto-close', () => {
  it('does not close shifts younger than 10 hours', () => {
    const now = new Date('2026-07-02T18:00:00Z')
    const startedAt = '2026-07-02T10:00:00Z'
    expect(isShiftStaleForAutoClose(startedAt, now)).toBe(false)
    expect(computeAutoCloseTimes(startedAt, now).shouldClose).toBe(false)
  })

  it('closes shifts exactly at 10 hours', () => {
    const startedAt = '2026-07-02T08:00:00Z'
    const now = new Date('2026-07-02T18:00:00Z')
    const result = computeAutoCloseTimes(startedAt, now)
    expect(result.shouldClose).toBe(true)
    expect(result.total_minutes).toBe(ATTENDANCE_AUTO_CLOSE_HOURS * 60)
    expect(result.ended_at).toBe('2026-07-02T18:00:00.000Z')
  })

  it('closes shifts older than 10 hours (next-day check-in scenario)', () => {
    const startedAt = '2026-07-01T07:00:00Z'
    const now = new Date('2026-07-02T08:00:00Z')
    expect(isShiftStaleForAutoClose(startedAt, now)).toBe(true)
    const result = computeAutoCloseTimes(startedAt, now)
    expect(result.ended_at).toBe('2026-07-01T17:00:00.000Z')
    expect(result.total_minutes).toBe(600)
  })
})
