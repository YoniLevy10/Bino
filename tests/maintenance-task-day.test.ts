import { describe, expect, it } from 'vitest'
import { getIsraelDayBounds, isMaintenanceTaskForToday } from '@/lib/maintenance-task-day'

describe('isMaintenanceTaskForToday', () => {
  it('includes open tasks with no due date', () => {
    expect(isMaintenanceTaskForToday({ dueAt: null, status: 'PENDING' })).toBe(true)
    expect(isMaintenanceTaskForToday({ dueAt: null, status: 'DONE' })).toBe(false)
  })

  it('includes tasks due within today Israel bounds', () => {
    const { startIso, endIso } = getIsraelDayBounds()
    const mid = new Date((new Date(startIso).getTime() + new Date(endIso).getTime()) / 2)
    expect(
      isMaintenanceTaskForToday({ dueAt: mid.toISOString(), status: 'IN_PROGRESS' })
    ).toBe(true)
  })

  it('excludes tasks due on another day', () => {
    const other = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    expect(
      isMaintenanceTaskForToday({ dueAt: other.toISOString(), status: 'PENDING' })
    ).toBe(false)
  })
})
