import { describe, expect, it } from 'vitest'
import {
  extractPaymentReference,
  generatePaymentReference,
} from '@/lib/bank-match/payment-reference'

describe('payment reference', () => {
  it('generates BINO-XXXX', () => {
    const ref = generatePaymentReference()
    expect(ref).toMatch(/^BINO-[A-Z0-9]{4}$/)
  })

  it('normalizes provided seed', () => {
    expect(generatePaymentReference('bino-ab12')).toBe('BINO-AB12')
  })

  it('extracts from free text', () => {
    expect(extractPaymentReference('העברה BINO-A1B2 דירה 12')).toBe('BINO-A1B2')
    expect(extractPaymentReference('no ref')).toBeNull()
  })
})
