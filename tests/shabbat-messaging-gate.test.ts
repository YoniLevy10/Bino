import { describe, expect, it } from 'vitest'
import {
  isIsraelShabbat,
  isOutboundMessagingBlocked,
  isShabbatMessagingSkipMessage,
  SHABBAT_MESSAGING_BLOCK_REASON,
  shabbatMessagingBlockReason,
} from '@/lib/shabbat-messaging-gate'

function israelDate(year: number, month: number, day: number, hour = 12): Date {
  // Interpret as Israel local wall time via offset approximation for tests
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`
  return new Date(iso)
}

describe('shabbat-messaging-gate', () => {
  it('blocks on Saturday Israel time (calendar day, not sunset)', () => {
    const sat = israelDate(2026, 7, 11, 10)
    expect(isIsraelShabbat(sat)).toBe(true)
    expect(isOutboundMessagingBlocked(sat)).toBe(true)
    expect(shabbatMessagingBlockReason(sat)).toBe(SHABBAT_MESSAGING_BLOCK_REASON)
  })

  it('allows on Sunday Israel time', () => {
    const sun = israelDate(2026, 7, 12, 10)
    expect(isIsraelShabbat(sun)).toBe(false)
    expect(isOutboundMessagingBlocked(sun)).toBe(false)
  })

  it('allows on Friday Israel time (including evening — product uses Sat calendar day)', () => {
    const fri = israelDate(2026, 7, 10, 18)
    expect(isIsraelShabbat(fri)).toBe(false)
    expect(shabbatMessagingBlockReason(fri)).toBeNull()
  })

  it('detects Shabbat skip messages for ops / error_logs classification', () => {
    expect(isShabbatMessagingSkipMessage(SHABBAT_MESSAGING_BLOCK_REASON)).toBe(true)
    expect(
      isShabbatMessagingSkipMessage(
        `תבנית "worker_assignment_notice": ${SHABBAT_MESSAGING_BLOCK_REASON}`
      )
    ).toBe(true)
    expect(isShabbatMessagingSkipMessage('WhatsApp send returned null (timeout/error)')).toBe(false)
  })
})
