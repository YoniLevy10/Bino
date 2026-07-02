import { describe, expect, it } from 'vitest'
import {
  buildManagerShiftPatch,
  computeShiftTotalMinutes,
} from '@/lib/attendance-shift-patch'
import {
  decimalHoursToMinutes,
  minutesToDecimalHours,
  toDatetimeLocalValue,
} from '@/lib/attendance-display'

describe('computeShiftTotalMinutes', () => {
  it('computes minutes between start and end', () => {
    const start = '2026-01-01T08:00:00.000Z'
    const end = '2026-01-01T16:30:00.000Z'
    expect(computeShiftTotalMinutes(start, end)).toBe(510)
  })
})

describe('buildManagerShiftPatch', () => {
  const existing = {
    started_at: '2026-01-01T08:00:00.000Z',
    ended_at: '2026-01-01T16:00:00.000Z',
    status: 'closed',
  }

  it('marks closed shift as edited when times change', () => {
    const patch = buildManagerShiftPatch(existing, {
      ended_at: '2026-01-01T17:00:00.000Z',
    })
    expect(patch.status).toBe('edited')
    expect(patch.total_minutes).toBe(540)
  })

  it('closes open shift when manager sets checkout', () => {
    const patch = buildManagerShiftPatch(
      { ...existing, ended_at: null, status: 'open' },
      { ended_at: '2026-01-01T16:00:00.000Z' }
    )
    expect(patch.status).toBe('closed')
    expect(patch.total_minutes).toBe(480)
  })

  it('applies total_minutes override and derives ended_at', () => {
    const patch = buildManagerShiftPatch(existing, { total_minutes: 300 })
    expect(patch.total_minutes).toBe(300)
    expect(patch.ended_at).toBe('2026-01-01T13:00:00.000Z')
    expect(patch.status).toBe('edited')
  })

  it('does not change status when only admin_note updates', () => {
    const patch = buildManagerShiftPatch(existing, { admin_note: 'תיקון ידני' })
    expect(patch.status).toBeUndefined()
    expect(patch.admin_note).toBe('תיקון ידני')
  })
})

describe('attendance display helpers', () => {
  it('round-trips local datetime for inputs', () => {
    const iso = '2026-07-02T10:30:00.000Z'
    const local = toDatetimeLocalValue(iso)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('converts decimal hours to minutes', () => {
    expect(decimalHoursToMinutes('8.5')).toBe(510)
    expect(minutesToDecimalHours(510)).toBe('8.50')
  })
})
