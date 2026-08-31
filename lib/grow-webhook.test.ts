import { describe, expect, it } from 'vitest'
import {
  authorizeGrowWebhook,
  extractGrowWebhookIds,
  isGrowPaidStatus,
} from '@/lib/grow-webhook'

describe('isGrowPaidStatus', () => {
  it('treats statusCode 2 as paid', () => {
    expect(isGrowPaidStatus(2)).toBe(true)
    expect(isGrowPaidStatus('2')).toBe(true)
    expect(isGrowPaidStatus(1)).toBe(false)
  })
})

describe('extractGrowWebhookIds', () => {
  it('reads nested data fields and cField1 public token', () => {
    const ids = extractGrowWebhookIds({
      statusCode: 2,
      data: {
        cField1: '11111111-1111-4111-8111-111111111111',
        paymentLinkProcessId: '88',
        transactionId: 'tx-1',
        transactionToken: 'tok',
      },
    })
    expect(ids.paid).toBe(true)
    expect(ids.publicTokens).toEqual(['11111111-1111-4111-8111-111111111111'])
    expect(ids.paymentLinkIds).toEqual(['88'])
    expect(ids.transactionIds).toEqual(['tx-1'])
    expect(ids.transactionToken).toBe('tok')
  })
})

describe('authorizeGrowWebhook', () => {
  it('requires matching query or header token', () => {
    expect(
      authorizeGrowWebhook({
        expectedSecret: '',
        tokenFromQuery: null,
        tokenFromHeader: null,
      })
    ).toBe(false)

    expect(
      authorizeGrowWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: 'secret',
        tokenFromHeader: null,
      })
    ).toBe(true)

    expect(
      authorizeGrowWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: null,
        tokenFromHeader: 'secret',
      })
    ).toBe(true)

    expect(
      authorizeGrowWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: 'wrong',
        tokenFromHeader: null,
      })
    ).toBe(false)
  })
})
