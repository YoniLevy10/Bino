import { describe, it, expect } from 'vitest'
import { isDuplicateScan, DUPLICATE_SCAN_WINDOW_MS } from '@/lib/attendance-duplicate'
import { formatShiftMinutes } from '@/lib/attendance-display'

describe('attendance-duplicate', () => {
  it('rejects same tag within 2 minutes', () => {
    const now = Date.now()
    const lastAt = new Date(now - 30_000).toISOString()
    expect(isDuplicateScan('BMK1', lastAt, 'BMK1', now)).toBe(true)
  })

  it('allows same tag after window', () => {
    const now = Date.now()
    const lastAt = new Date(now - DUPLICATE_SCAN_WINDOW_MS - 1000).toISOString()
    expect(isDuplicateScan('BMK1', lastAt, 'BMK1', now)).toBe(false)
  })

  it('allows different tag immediately', () => {
    const now = Date.now()
    const lastAt = new Date(now - 10_000).toISOString()
    expect(isDuplicateScan('BMK1', lastAt, 'BMK2', now)).toBe(false)
  })
})

describe('formatShiftMinutes', () => {
  it('formats hours and minutes', () => {
    expect(formatShiftMinutes(90)).toBe('1:30 שעות')
    expect(formatShiftMinutes(null)).toBe('—')
  })
})
