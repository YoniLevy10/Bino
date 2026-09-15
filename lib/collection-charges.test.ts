import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  buildPaymentSmsBody,
  chargePaymentUrl,
  formatChargeAmountIls,
  isCollectionChargeStatus,
  COLLECTION_CHARGE_STATUSES,
} from '@/lib/collection-charges'
import {
  buildGrowWebhookNotifyUrl,
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
  markCollectionChargePaidBodySchema,
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

  it('prefers Grow payment URL over legacy Morning URL (read fallback)', () => {
    expect(
      chargePaymentUrl({
        grow_payment_url: 'https://grow.example/pay',
        greeninvoice_payment_url: 'https://morning.example/pay',
      })
    ).toBe('https://grow.example/pay')
    expect(chargePaymentUrl({ grow_payment_url: null, greeninvoice_payment_url: 'https://m' })).toBe(
      'https://m'
    )
    expect(chargePaymentUrl({ grow_payment_url: '  ', greeninvoice_payment_url: '' })).toBeNull()
  })
})

describe('collection charge ops URL helpers', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL
  const prevGrowSecret = process.env.GROW_WEBHOOK_SECRET
  const prevGrowKey = process.env.GROW_API_KEY
  const prevGrowPage = process.env.GROW_PAGE_CODE

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://bamakor.vercel.app'
    process.env.GROW_WEBHOOK_SECRET = 'hook-secret'
    process.env.GROW_API_KEY = 'api-key'
    process.env.GROW_PAGE_CODE = 'page-code'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = prevApp
    process.env.GROW_WEBHOOK_SECRET = prevGrowSecret
    process.env.GROW_API_KEY = prevGrowKey
    process.env.GROW_PAGE_CODE = prevGrowPage
  })

  it('builds public pay and Grow notify URLs', () => {
    expect(buildPublicPayUrl('11111111-1111-1111-1111-111111111111')).toBe(
      'https://bamakor.vercel.app/pay/11111111-1111-1111-1111-111111111111'
    )
    expect(buildGrowWebhookNotifyUrl()).toBe(
      'https://bamakor.vercel.app/api/webhook/grow?token=hook-secret'
    )
  })

  it('omits notify URL when webhook secret missing', () => {
    process.env.GROW_WEBHOOK_SECRET = ''
    expect(buildGrowWebhookNotifyUrl()).toBeNull()
  })

  it('defaults success/failure to Bino pay pages with charge token', () => {
    const urls = defaultSuccessFailureUrls(
      {},
      { publicToken: '11111111-1111-1111-1111-111111111111' }
    )
    expect(urls.successUrl).toBe(
      'https://bamakor.vercel.app/pay/success?t=11111111-1111-1111-1111-111111111111'
    )
    expect(urls.failureUrl).toBe(
      'https://bamakor.vercel.app/pay/failure?t=11111111-1111-1111-1111-111111111111'
    )
  })

  it('defaults success/failure without token when omitted', () => {
    const urls = defaultSuccessFailureUrls({})
    expect(urls.successUrl).toBe('https://bamakor.vercel.app/pay/success')
    expect(urls.failureUrl).toBe('https://bamakor.vercel.app/pay/failure')
  })

  it('requires Grow platform keys + tenant userId', () => {
    expect(
      requireConfiguredCredentials({
        grow_enabled: false,
        grow_user_id: 'u1',
      }).ok
    ).toBe(false)

    const ok = requireConfiguredCredentials({
      grow_enabled: true,
      grow_user_id: 'u1',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.userId).toBe('u1')
    }

    process.env.GROW_API_KEY = ''
    expect(
      requireConfiguredCredentials({
        grow_enabled: true,
        grow_user_id: 'u1',
      }).ok
    ).toBe(false)
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

  it('accepts send/resend/cancel/mark-paid charge id bodies', () => {
    expect(sendCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
    expect(resendCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
    expect(cancelCollectionChargeBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
    expect(markCollectionChargePaidBodySchema.safeParse({ charge_id: chargeId }).success).toBe(true)
  })
})

describe('collections nav mapping', () => {
  it('maps /collections to collections nav id', () => {
    expect(navItemIdForPathname('/collections')).toBe('collections')
  })
})

describe('markChargePaidByGrowIds', () => {
  it('updates by public token and skips empty', async () => {
    const { markChargePaidByGrowIds } = await import('@/lib/collection-charge-ops')

    const calls: Array<{ table: string; op: string }> = []
    const makeChain = () => {
      const c: Record<string, unknown> = {}
      c.update = () => {
        calls.push({ table: 'collection_charges', op: 'update' })
        return c
      }
      c.in = () => c
      c.neq = () => c
      c.eq = () => c
      c.is = () => c
      c.maybeSingle = async () => ({ data: null, error: null })
      c.select = () => {
        const terminal = Promise.resolve({ data: [{ id: '1' }], error: null })
        return Object.assign(terminal, c)
      }
      return c
    }
    const admin = {
      from: (table: string) => {
        calls.push({ table, op: 'from' })
        return makeChain()
      },
    }

    const empty = await markChargePaidByGrowIds(admin as never, {
      publicTokens: [],
      paymentLinkIds: [],
      transactionIds: [],
    })
    expect(empty.matched).toBe(0)

    const matched = await markChargePaidByGrowIds(admin as never, {
      publicTokens: ['11111111-1111-4111-8111-111111111111'],
      paymentLinkIds: [],
      transactionIds: ['tx-1'],
    })
    expect(matched.matched).toBe(1)
    expect(calls.some((c) => c.op === 'update')).toBe(true)
  })
})
