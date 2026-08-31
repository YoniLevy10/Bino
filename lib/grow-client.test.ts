import { describe, expect, it } from 'vitest'
import { parseGrowPaymentLinkResponse } from '@/lib/grow-client'
import { parseGrowEnv, sanitizeGrowPlainText } from '@/lib/grow-config'

describe('parseGrowEnv', () => {
  it('defaults to production unless sandbox', () => {
    expect(parseGrowEnv(undefined)).toBe('production')
    expect(parseGrowEnv('')).toBe('production')
    expect(parseGrowEnv('production')).toBe('production')
    expect(parseGrowEnv('sandbox')).toBe('sandbox')
  })
})

describe('sanitizeGrowPlainText', () => {
  it('strips Grow-rejected symbols and collapses spaces', () => {
    expect(sanitizeGrowPlainText('ועד <בית> #1 & "דירה"')).toBe('ועד בית 1 דירה')
  })
})

describe('parseGrowPaymentLinkResponse', () => {
  it('reads nested data.url and process id', () => {
    const parsed = parseGrowPaymentLinkResponse({
      status: 1,
      data: {
        url: 'https://secure.meshulam.co.il/pay/abc',
        paymentLinkProcessId: 99,
        paymentLinkProcessToken: 'tok',
      },
    })
    expect(parsed).toEqual({
      url: 'https://secure.meshulam.co.il/pay/abc',
      paymentLinkProcessId: '99',
      paymentLinkProcessToken: 'tok',
    })
  })

  it('rejects non-success status', () => {
    expect(
      parseGrowPaymentLinkResponse({
        status: 0,
        err: 'bad',
        data: { url: 'https://secure.meshulam.co.il/pay/abc' },
      })
    ).toBeNull()
  })
})
