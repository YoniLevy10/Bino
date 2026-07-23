import { describe, expect, it } from 'vitest'
import { usageAnalyticsExportFilename } from '@/lib/usage-analytics-export'

describe('usageAnalyticsExportFilename', () => {
  it('includes lookback days and ISO date', () => {
    const name = usageAnalyticsExportFilename(30, new Date('2026-07-23T12:00:00.000Z'))
    expect(name).toBe('bamakor-usage-30d-2026-07-23.xlsx')
  })
})
