import { describe, expect, it } from 'vitest'
import { isIsraelShabbat, isOutboundMessagingBlocked, shabbatMessagingBlockReason } from '@/lib/shabbat-messaging-gate'

function israelDate(year: number, month: number, day: number, hour = 12): Date {
  // Interpret as Israel local wall time via offset approximation for tests
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`
  return new Date(iso)
}

describe('shabbat-messaging-gate', () => {
  it('blocks on Saturday Israel time', () => {
    const sat = israelDate(2026, 7, 11, 10)
    expect(isIsraelShabbat(sat)).toBe(true)
    expect(isOutboundMessagingBlocked(sat)).toBe(true)
    expect(shabbatMessagingBlockReason(sat)).toContain('שבת')
  })

  it('allows on Sunday Israel time', () => {
    const sun = israelDate(2026, 7, 12, 10)
    expect(isIsraelShabbat(sun)).toBe(false)
    expect(isOutboundMessagingBlocked(sun)).toBe(false)
  })

  it('allows on Friday Israel time', () => {
    const fri = israelDate(2026, 7, 10, 18)
    expect(isIsraelShabbat(fri)).toBe(false)
  })
})
