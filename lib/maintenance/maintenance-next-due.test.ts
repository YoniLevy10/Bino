import { describe, expect, it } from 'vitest'
import { nextDueAfter } from './maintenance-next-due'

describe('nextDueAfter', () => {
  it('advances weekly from due_at in the future', () => {
    const due = '2030-01-15T10:00:00.000Z'
    const weekly = nextDueAfter(due, 'weekly', new Date('2030-01-01T00:00:00.000Z'))
    expect(weekly).toBe('2030-01-22T10:00:00.000Z')
  })

  it('advances monthly', () => {
    const due = '2030-01-15T10:00:00.000Z'
    const monthly = new Date(
      nextDueAfter(due, 'monthly', new Date('2030-01-01T00:00:00.000Z'))
    )
    expect(monthly.getUTCMonth()).toBe(1)
  })
})
