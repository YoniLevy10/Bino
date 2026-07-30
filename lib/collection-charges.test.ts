import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  buildPaymentSmsBody,
  formatChargeAmountIls,
  isCollectionChargeStatus,
  COLLECTION_CHARGE_STATUSES,
} from '@/lib/collection-charges'
import {
  authorizeGreenInvoiceWebhook,
  extractGreenInvoiceWebhookIds,
} from '@/lib/greeninvoice-webhook'
import {
  buildGreenInvoiceWebhookNotifyUrl,
  buildPublicPayUrl,
  defaultSuccessFailureUrls,
  requireConfiguredCredentials,
} from '@/lib/collection-charge-ops'
import {
  bulkSendCollectionChargesBodySchema,
  createCollectionChargeBodySchema,
  sendCollectionChargeBodySchema,
  cancelCollectionChargeBodySchema,
  resendCollectionChargeBodySchema,
} from '@/lib/api-body-schemas'
import { navItemIdForPathname } from '@/lib/client-nav-features'

describe('collection charge helpers', () => {
  it('formats ILS amounts without crashing', () => {
    expect(formatChargeAmountIls(150)).toContain('150')
    expect(formatChargeAmountIls(150.5)).toMatch(/150/)
  })

  it('builds SMS without emoji (019SMS-safe)', () => {
    const body = buildPaymentSmsBody({
      residentName: 'ישראל',
      title: 'ועד בית',
      amount: 200,
      payUrl: 'https://bamakor.vercel.app/pay/abc',
    })
    expect(body).toContain('ישראל')
    expect(body).toContain('ועד בית')
    expect(body).toContain('https://bamakor.vercel.app/pay/abc')
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
    expect(body).not.toContain('✅')
    expect(body).not.toContain('💳')
  })

  it('validates status enum', () => {
    for (const s of COLLECTION_CHARGE_STATUSES) {
      expect(isCollectionChargeStatus(s)).toBe(true)
    }
    expect(isCollectionChargeStatus('all')).toBe(false)
    expect(isCollectionChargeStatus('')).toBe(false)
  })
})

describe('greeninvoice webhook parsing', () => {
  it('extracts payment/receive ids without treating id as document', () => {
    const ids = extractGreenInvoiceWebhookIds({
      id: 'pay-111',
      channel: 'document',
      productId: 'plugin-should-not-match-as-payment',
      documentId: 'doc-222',
      transactions: [{ id: 'tx-333' }],
    })
    expect(ids.paymentIds).toContain('pay-111')
    expect(ids.paymentIds).toContain('tx-333')
    expect(ids.paymentIds).not.toContain('plugin-should-not-match-as-payment')
    expect(ids.documentIds).toContain('doc-222')
  })

  it('treats document/created top-level id as document id', () => {
    const ids = extractGreenInvoiceWebhookIds({
      id: 'doc-aaa',
      type: 320,
      number: 60129,
      transactions: [{ id: 'tx-bbb' }],
    })
    expect(ids.documentIds).toEqual(['doc-aaa'])
    expect(ids.paymentIds).toEqual(['tx-bbb'])
  })

  it('authorizes webhook token correctly', () => {
    expect(
      authorizeGreenInvoiceWebhook({
        expectedSecret: '',
        tokenFromQuery: null,
        tokenFromHeader: null,
      })
    ).toBe(true)

    expect(
      authorizeGreenInvoiceWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: 'secret',
        tokenFromHeader: null,
      })
    ).toBe(true)

    expect(
      authorizeGreenInvoiceWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: null,
        tokenFromHeader: 'secret',
      })
    ).toBe(true)

    expect(
      authorizeGreenInvoiceWebhook({
        expectedSecret: 'secret',
        tokenFromQuery: 'wrong',
        tokenFromHeader: null,
      })
    ).toBe(false)
  })
})

describe('collection charge ops URL helpers', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL
  const prevSecret = process.env.GREENINVOICE_WEBHOOK_SECRET

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://bamakor.vercel.app'
    process.env.GREENINVOICE_WEBHOOK_SECRET = 'hook-secret'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prevApp
    process.env.GREENINVOICE_WEBHOOK_SECRET = prevSecret
  })

  it('builds public pay and notify URLs', () => {
    expect(buildPublicPayUrl('11111111-1111-1111-1111-111111111111')).toBe(
      'https://bamakor.vercel.app/pay/11111111-1111-1111-1111-111111111111'
    )
    expect(buildGreenInvoiceWebhookNotifyUrl()).toBe(
      'https://bamakor.vercel.app/api/webhook/greeninvoice?token=hook-secret'
    )
  })

  it('defaults success/failure to Bamakor pay pages', () => {
    const urls = defaultSuccessFailureUrls({})
    expect(urls.successUrl).toBe('https://bamakor.vercel.app/pay/success')
    expect(urls.failureUrl).toBe('https://bamakor.vercel.app/pay/failure')
  })

  it('prefers tenant custom success/failure URLs', () => {
    const urls = defaultSuccessFailureUrls({
      greeninvoice_payment_success_url: 'https://example.com/ok',
      greeninvoice_payment_failure_url: 'https://example.com/fail',
    })
    expect(urls.successUrl).toBe('https://example.com/ok')
    expect(urls.failureUrl).toBe('https://example.com/fail')
  })

  it('requires greeninvoice enabled + keys', () => {
    expect(
      requireConfiguredCredentials({
        greeninvoice_enabled: false,
        greeninvoice_api_key_id: 'k',
        greeninvoice_api_secret: 's',
      }).ok
    ).toBe(false)

    const ok = requireConfiguredCredentials({
      greeninvoice_enabled: true,
      greeninvoice_api_key_id: 'k',
      greeninvoice_api_secret: 's',
      greeninvoice_env: 'sandbox',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.credentials.apiKeyId).toBe('k')
      expect(ok.credentials.env).toBe('sandbox')
    }
  })
})

describe('collections zod schemas', () => {
  const residentId = '550e8400-e29b-41d4-a716-446655440001'
  const projectId = '550e8400-e29b-41d4-a716-446655440002'
  const chargeId = '550e8400-e29b-41d4-a716-446655440003'

  it('accepts valid create body', () => {
    const parsed = createCollectionChargeBodySchema.safeParse({
      project_id: projectId,
      resident_id: residentId,
      title: 'ועד בית',
      amount: 350,
      send: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects non-positive amount', () => {
    const parsed = createCollectionChargeBodySchema.safeParse({
      project_id: projectId,
      resident_id: residentId,
      title: 'ועד',
      amount: 0,
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts bulk send with items', () => {
    const parsed = bulkSendCollectionChargesBodySchema.safeParse({
      project_id: projectId,
      title_template: 'ועד בית',
      items: [{ resident_id: residentId, amount: 120 }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects empty bulk items', () => {
    const parsed = bulkSendCollectionChargesBodySchema.safeParse({
      project_id: projectId,
      title_template: 'ועד בית',
      items: [],
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts send/resend/cancel charge id bodies', () => {
    expect(sendCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
    expect(resendCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
    expect(cancelCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
  })
})

describe('collections nav mapping', () => {
  it('maps /collections to collections nav id', () => {
    expect(navItemIdForPathname('/collections')).toBe('collections')
  })
})

describe('markChargePaidByMorningIds', () => {
  it('updates by payment ids and skips empty', async () => {
    const { markChargePaidByMorningIds } = await import('@/lib/collection-charge-ops')

    const calls: Array<{ table: string; op: string }> = []
    const makeChain = () => {
      const c: Record<string, unknown> = {}
      c.update = () => {
        calls.push({ table: 'collection_charges', op: 'update' })
        return c
      }
      c.in = () => c
      c.neq = () => c
      c.select = async () => ({ data: [{ id: '1' }], error: null })
      return c
    }
    const admin = {
      from: (table: string) => {
        calls.push({ table, op: 'from' })
        return makeChain()
      },
    }

    const empty = await markChargePaidByMorningIds(admin as never, {
      paymentIds: [],
      documentIds: [],
    })
    expect(empty.matched).toBe(0)

    const matched = await markChargePaidByMorningIds(admin as never, {
      paymentIds: ['pay-1'],
      documentIds: [],
    })
    expect(matched.matched).toBe(1)
    expect(calls.some((c) => c.op === 'update')).toBe(true)
  })
})
