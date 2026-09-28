import { afterEach, describe, expect, it } from 'vitest'
import { extractGrowRegisterWebhook } from '@/lib/grow-register'
import { readGrowRegisterConfig } from '@/lib/grow-config'

describe('extractGrowRegisterWebhook', () => {
  it('reads approved tracking_status id 3 and user_id', () => {
    const parsed = extractGrowRegisterWebhook({
      data: {
        tracking_code: 'lead-abc',
        user_id: 'user-123',
        business_title: 'ועד בדיקה',
        phone: '0501234567',
        package_name: 'basic',
        tracking_status: { id: 3, message: 'הוקם בהצלחה' },
      },
    })
    expect(parsed.trackingCode).toBe('lead-abc')
    expect(parsed.userId).toBe('user-123')
    expect(parsed.approved).toBe(true)
    expect(parsed.rejected).toBe(false)
  })

  it('marks rejected when status id is 4', () => {
    const parsed = extractGrowRegisterWebhook({
      tracking_code: 'x',
      tracking_status: { id: '4', message: 'נדחה' },
    })
    expect(parsed.rejected).toBe(true)
    expect(parsed.approved).toBe(false)
  })
})

describe('readGrowRegisterConfig', () => {
  const keys = [
    'GROW_REGISTER_X_API_KEY',
    'GROW_MARKETER',
    'GROW_PRICE_QUOTE',
    'GROW_ENV',
    'GROW_REGISTER_IS_DIRECT_DEBIT',
  ] as const
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {}

  afterEach(() => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key]
      else process.env[key] = prev[key]
      delete prev[key]
    }
  })

  it('requires register x-api-key, marketer, price_quote', () => {
    for (const key of keys) prev[key] = process.env[key]
    process.env.GROW_REGISTER_X_API_KEY = 'reg-key'
    process.env.GROW_MARKETER = 'marketer-1'
    process.env.GROW_PRICE_QUOTE = '1997'
    process.env.GROW_ENV = 'sandbox'
    delete process.env.GROW_REGISTER_IS_DIRECT_DEBIT
    const cfg = readGrowRegisterConfig()
    expect(cfg?.marketer).toBe('marketer-1')
    expect(cfg?.priceQuote).toBe('1997')
    expect(cfg?.isDirectDebit).toBe(1)
    expect(cfg?.baseUrl).toContain('devregisterapi')
  })
})
