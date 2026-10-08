import { describe, expect, it } from 'vitest'
import {
  authorizeGrowWebhook,
  expandBracketFormKeys,
  extractGrowWebhookIds,
  growCallbackSumMatchesCharge,
  isGrowPaidStatus,
} from '@/lib/grow-webhook'

describe('isGrowPaidStatus', () => {
  it('treats statusCode 2 as paid', () => {
    expect(isGrowPaidStatus(2)).toBe(true)
    expect(isGrowPaidStatus('2')).toBe(true)
    expect(isGrowPaidStatus(1)).toBe(false)
  })

  it('treats Hebrew status שולם as paid', () => {
    expect(isGrowPaidStatus(undefined, 'שולם')).toBe(true)
    expect(isGrowPaidStatus(undefined, '1')).toBe(false)
  })
})

describe('expandBracketFormKeys', () => {
  it('expands Grow updateMyUrl-style form keys', () => {
    const expanded = expandBracketFormKeys({
      status: '1',
      err: '',
      'data[statusCode]': '2',
      'data[sum]': '1.00',
      'data[processId]': '71167',
      'data[transactionId]': 'tx-9',
      'data[transactionToken]': 'tok-9',
      'data[customFields][cField1]': '11111111-1111-4111-8111-111111111111',
    })
    const data = expanded.data as Record<string, unknown>
    expect(data.statusCode).toBe('2')
    expect(data.sum).toBe('1.00')
    expect((data.customFields as Record<string, string>).cField1).toBe(
      '11111111-1111-4111-8111-111111111111'
    )
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
        sum: '12.5',
      },
    })
    expect(ids.paid).toBe(true)
    expect(ids.publicTokens).toEqual(['11111111-1111-4111-8111-111111111111'])
    expect(ids.paymentLinkIds).toEqual(['88'])
    expect(ids.transactionIds).toEqual(['tx-1'])
    expect(ids.transactionToken).toBe('tok')
    expect(ids.sum).toBe('12.5')
  })

  it('reads customFields.cField1 from docs-shaped JSON', () => {
    const ids = extractGrowWebhookIds({
      status: '1',
      data: {
        statusCode: '2',
        status: 'שולם',
        customFields: { cField1: '22222222-2222-4222-8222-222222222222' },
        processId: '99',
        transactionId: 'tx-2',
        transactionToken: 'tok-2',
        sum: '1',
      },
    })
    expect(ids.paid).toBe(true)
    expect(ids.publicTokens).toEqual(['22222222-2222-4222-8222-222222222222'])
    expect(ids.paymentLinkIds).toEqual(['99'])
  })

  it('reads expanded bracket form from Grow S2S callback', () => {
    const expanded = expandBracketFormKeys({
      status: '1',
      'data[statusCode]': '2',
      'data[sum]': '1',
      'data[processId]': '71167',
      'data[paymentType]': '2',
      'data[transactionTypeId]': '1',
      'data[transactionId]': 'tx-form',
      'data[transactionToken]': 'tok-form',
      'data[customFields][cField1]': '33333333-3333-4333-8333-333333333333',
    })
    const ids = extractGrowWebhookIds(expanded)
    expect(ids.paid).toBe(true)
    expect(ids.publicTokens).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(ids.paymentLinkIds).toEqual(['71167'])
    expect(ids.transactionIds).toEqual(['tx-form'])
    expect(ids.sum).toBe('1')
  })
})

describe('growCallbackSumMatchesCharge', () => {
  it('allows missing callback sum', () => {
    expect(growCallbackSumMatchesCharge(null, 10)).toBe(true)
  })

  it('compares amounts with cents tolerance', () => {
    expect(growCallbackSumMatchesCharge('1.00', 1)).toBe(true)
    expect(growCallbackSumMatchesCharge('10', 11)).toBe(false)
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

    expect(
      authorizeGrowWebhook({
        expectedSecret: 'a, b',
        tokenFromQuery: 'b',
        tokenFromHeader: null,
      })
    ).toBe(true)
  })
})
