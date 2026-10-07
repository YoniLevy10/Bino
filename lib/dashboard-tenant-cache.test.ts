import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_SECONDARY_COUNT_TTL_MS,
  secondaryCountsAreFresh,
} from '@/lib/dashboard-tenant-cache'

describe('secondaryCountsAreFresh', () => {
  it('is false for missing timestamps', () => {
    expect(secondaryCountsAreFresh(null)).toBe(false)
    expect(secondaryCountsAreFresh(undefined)).toBe(false)
    expect(secondaryCountsAreFresh(Number.NaN)).toBe(false)
  })

  it('is true within the 5-minute TTL', () => {
    const now = 1_000_000
    expect(secondaryCountsAreFresh(now - DASHBOARD_SECONDARY_COUNT_TTL_MS + 1, now)).toBe(true)
  })

  it('is false at or after the TTL', () => {
    const now = 1_000_000
    expect(secondaryCountsAreFresh(now - DASHBOARD_SECONDARY_COUNT_TTL_MS, now)).toBe(false)
    expect(secondaryCountsAreFresh(now - DASHBOARD_SECONDARY_COUNT_TTL_MS - 1, now)).toBe(false)
  })
})
