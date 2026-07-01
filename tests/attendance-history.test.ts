import { describe, expect, it } from 'vitest'
import { groupShiftsByMonthAndWorker, type AttendanceHistoryShift } from '@/lib/attendance-history'
import { currentMonthKey, monthBoundsFromKey } from '@/lib/attendance-display'

function shift(partial: Partial<AttendanceHistoryShift> & Pick<AttendanceHistoryShift, 'id' | 'worker_id' | 'started_at'>): AttendanceHistoryShift {
  return {
    worker_name: 'עובד',
    hourly_rate: 50,
    ended_at: null,
    total_minutes: 60,
    status: 'closed',
    ...partial,
  }
}

describe('groupShiftsByMonthAndWorker', () => {
  it('groups by month then worker', () => {
    const jan = monthBoundsFromKey('2026-01')!
    const groups = groupShiftsByMonthAndWorker([
      shift({ id: '1', worker_id: 'w1', worker_name: 'אבי', started_at: jan.from, total_minutes: 120 }),
      shift({ id: '2', worker_id: 'w1', worker_name: 'אבי', started_at: jan.from, total_minutes: 60 }),
      shift({ id: '3', worker_id: 'w2', worker_name: 'דני', started_at: jan.from, total_minutes: 90 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].monthKey).toBe('2026-01')
    expect(groups[0].shiftCount).toBe(3)
    expect(groups[0].totalMinutes).toBe(270)
    expect(groups[0].workerGroups).toHaveLength(2)
    expect(groups[0].workerGroups[0].workerName).toBe('אבי')
    expect(groups[0].workerGroups[0].totalMinutes).toBe(180)
  })

  it('sorts months descending', () => {
    const jan = monthBoundsFromKey('2026-01')!
    const feb = monthBoundsFromKey('2026-02')!
    const groups = groupShiftsByMonthAndWorker([
      shift({ id: '1', worker_id: 'w1', started_at: jan.from }),
      shift({ id: '2', worker_id: 'w1', started_at: feb.from }),
    ])
    expect(groups[0].monthKey).toBe('2026-02')
    expect(groups[1].monthKey).toBe('2026-01')
  })
})

describe('currentMonthKey', () => {
  it('returns YYYY-MM', () => {
    expect(currentMonthKey(new Date(2026, 6, 15))).toBe('2026-07')
  })
})
