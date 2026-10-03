/**
 * Grow S2S webhook hardening (A5 / H2 / H3):
 * - sum mismatch must not call ApproveTransaction
 * - Approve credentials exist → never mark paid before Approve
 * - duplicate paid callback is idempotent (no second mark-paid update)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const approveGrowTransaction = vi.fn()
const findChargeIdsByGrowIds = vi.fn()
const markChargePaidByGrowIds = vi.fn()
const persistGrowTransactionIds = vi.fn()
const preflightGrowWebhookSumCheck = vi.fn()
const recordGrowApproveResult = vi.fn()
const notifyPlatformOps = vi.fn()

vi.mock('@/lib/grow-client', () => ({
  approveGrowTransaction: (...args: unknown[]) => approveGrowTransaction(...args),
}))

vi.mock('@/lib/collection-charge-ops', () => ({
  findChargeIdsByGrowIds: (...args: unknown[]) => findChargeIdsByGrowIds(...args),
  markChargePaidByGrowIds: (...args: unknown[]) => markChargePaidByGrowIds(...args),
  persistGrowTransactionIds: (...args: unknown[]) => persistGrowTransactionIds(...args),
  preflightGrowWebhookSumCheck: (...args: unknown[]) => preflightGrowWebhookSumCheck(...args),
  recordGrowApproveResult: (...args: unknown[]) => recordGrowApproveResult(...args),
}))

vi.mock('@/lib/platform-ops-alert', () => ({
  notifyPlatformOps: (...args: unknown[]) => notifyPlatformOps(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ mocked: true }),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/lib/grow-config', () => ({
  readGrowPlatformConfig: () => ({
    env: 'sandbox',
    apiKey: 'k',
    xApiKey: 'x',
    pageCode: 'p',
    walletPageCode: 'p',
    webhookSecret: 'hook-secret',
  }),
}))

function paidPayload(overrides: Record<string, unknown> = {}) {
  return {
    statusCode: '2',
    data: {
      status: 'שולם',
      statusCode: '2',
      sum: '100',
      transactionId: 'tx-99',
      transactionToken: 'tok-99',
      transactionTypeId: '1',
      paymentType: '2',
      cField1: '11111111-1111-4111-8111-111111111111',
      paymentLinkProcessId: 'plink-1',
      ...overrides,
    },
  }
}

async function postGrow(body: unknown) {
  const { POST } = await import('@/app/api/webhook/grow/route')
  const req = new NextRequest('http://localhost/api/webhook/grow?token=hook-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req)
}

describe('POST /api/webhook/grow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    findChargeIdsByGrowIds.mockResolvedValue(['charge-1'])
    persistGrowTransactionIds.mockResolvedValue(undefined)
    recordGrowApproveResult.mockResolvedValue(undefined)
    notifyPlatformOps.mockResolvedValue(undefined)
  })

  it('sum mismatch skips Approve and does not mark paid', async () => {
    preflightGrowWebhookSumCheck.mockResolvedValue({
      unpaidCount: 1,
      sumRejected: 1,
      sumOkIds: [],
    })

    const res = await postGrow(paidPayload({ sum: '1' }))
    const json = await res.json()

    expect(json).toMatchObject({ ok: false, reason: 'sum_mismatch', matched: 0 })
    expect(approveGrowTransaction).not.toHaveBeenCalled()
    expect(markChargePaidByGrowIds).not.toHaveBeenCalled()
  })

  it('Approve failure does not mark paid', async () => {
    preflightGrowWebhookSumCheck.mockResolvedValue({
      unpaidCount: 1,
      sumRejected: 0,
      sumOkIds: ['charge-1'],
    })
    approveGrowTransaction.mockResolvedValue({ ok: false, error: 'ApproveTransaction נכשל' })

    const res = await postGrow(paidPayload())
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json.approveFailed).toBe(true)
    expect(approveGrowTransaction).toHaveBeenCalledTimes(1)
    expect(markChargePaidByGrowIds).not.toHaveBeenCalled()
    expect(notifyPlatformOps).toHaveBeenCalled()
  })

  it('Approve then mark paid when sum ok (never paid-before-Approve)', async () => {
    const callOrder: string[] = []
    preflightGrowWebhookSumCheck.mockImplementation(async () => {
      callOrder.push('sum')
      return { unpaidCount: 1, sumRejected: 0, sumOkIds: ['charge-1'] }
    })
    approveGrowTransaction.mockImplementation(async () => {
      callOrder.push('approve')
      return { ok: true }
    })
    markChargePaidByGrowIds.mockImplementation(async () => {
      callOrder.push('mark')
      return { matched: 1, newlyPaidIds: ['charge-1'], sumRejected: 0 }
    })

    const res = await postGrow(paidPayload())
    const json = await res.json()

    expect(json).toMatchObject({ ok: true, matched: 1 })
    expect(callOrder).toEqual(['sum', 'approve', 'mark'])
  })

  it('duplicate paid callback is idempotent (matched 0, no newly paid)', async () => {
    preflightGrowWebhookSumCheck.mockResolvedValue({
      unpaidCount: 0,
      sumRejected: 0,
      sumOkIds: [],
    })
    findChargeIdsByGrowIds.mockResolvedValue(['charge-paid'])
    approveGrowTransaction.mockResolvedValue({ ok: true })
    markChargePaidByGrowIds.mockResolvedValue({
      matched: 0,
      newlyPaidIds: [],
      sumRejected: 0,
    })

    const res = await postGrow(paidPayload())
    const json = await res.json()

    expect(json).toMatchObject({ ok: true, matched: 0 })
    expect(approveGrowTransaction).toHaveBeenCalledTimes(1)
    expect(markChargePaidByGrowIds).toHaveBeenCalledTimes(1)
  })
})
