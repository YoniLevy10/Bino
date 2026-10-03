/**
 * Wallet update must not overwrite paid/cancelled (status-guard .in).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const inStatuses: unknown[][] = []
let updateReturnsRow: { id: string; status: string } | null = {
  id: 'charge-1',
  status: 'sent',
}
let reReadStatus: string | null = null
let maybeSingleCalls = 0

vi.mock('@/lib/rate-limit', () => ({
  checkIpPostRouteLimit: vi.fn(async () => ({ isLimited: false })),
}))

vi.mock('@/lib/grow-config', () => ({
  readGrowPlatformConfig: () => ({
    env: 'sandbox',
    apiKey: 'k',
    xApiKey: 'x',
    pageCode: 'p',
    walletPageCode: 'p',
    webhookSecret: 'hook',
  }),
  growSdkEnvironment: () => 'dev',
}))

vi.mock('@/lib/collection-charge-ops', () => ({
  buildGrowWebhookNotifyUrl: () => 'https://bino.casa/api/webhook/grow?token=hook',
  defaultSuccessFailureUrls: () => ({
    successUrl: 'https://bino.casa/pay/success',
    failureUrl: 'https://bino.casa/pay/failure',
  }),
  loadClientCollectionsRow: vi.fn(async () => ({
    id: 'client-1',
    grow_user_id: 'grow-user',
    name: 'Test',
  })),
  requireConfiguredCredentials: () => ({ ok: true, userId: 'grow-user' }),
}))

vi.mock('@/lib/grow-client', () => ({
  buildGrowInvoiceNotifyUrl: () => null,
  createGrowPaymentProcess: vi.fn(async () => ({
    ok: true,
    authCode: 'auth-1',
    processId: 'proc-1',
    processToken: 'ptok',
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = self
      chain.eq = self
      chain.update = () => chain
      chain.in = (col: string, values: unknown[]) => {
        if (col === 'status') inStatuses.push(values)
        return chain
      }
      chain.maybeSingle = async () => {
        maybeSingleCalls += 1
        if (maybeSingleCalls === 1) {
          return {
            data: {
              id: 'charge-1',
              client_id: 'client-1',
              title: 'ועד',
              amount: 50,
              status: 'sent',
              public_token: '11111111-1111-4111-8111-111111111111',
              residents: {
                full_name: 'דייר בדיקה',
                phone: '0501234567',
                normalized_phone: '0501234567',
                email: null,
              },
            },
            error: null,
          }
        }
        if (maybeSingleCalls === 2) {
          return { data: updateReturnsRow, error: null }
        }
        return { data: reReadStatus ? { status: reReadStatus } : null, error: null }
      }
      return chain
    },
  }),
}))

describe('POST /api/public/pay/[token]/wallet status guard', () => {
  beforeEach(() => {
    inStatuses.length = 0
    updateReturnsRow = { id: 'charge-1', status: 'sent' }
    reReadStatus = null
    maybeSingleCalls = 0
    vi.resetModules()
  })

  it('update filters status to draft/sent/failed only', async () => {
    const { POST } = await import('@/app/api/public/pay/[token]/wallet/route')
    const req = new NextRequest(
      'http://localhost/api/public/pay/11111111-1111-4111-8111-111111111111/wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    const res = await POST(req, {
      params: Promise.resolve({ token: '11111111-1111-4111-8111-111111111111' }),
    })
    expect(res.status).toBe(200)
    expect(inStatuses.some((v) => JSON.stringify(v) === JSON.stringify(['draft', 'sent', 'failed']))).toBe(
      true
    )
  })

  it('returns ALREADY_PAID when update race loses to paid', async () => {
    updateReturnsRow = null
    reReadStatus = 'paid'
    const { POST } = await import('@/app/api/public/pay/[token]/wallet/route')
    const req = new NextRequest(
      'http://localhost/api/public/pay/11111111-1111-4111-8111-111111111111/wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    const res = await POST(req, {
      params: Promise.resolve({ token: '11111111-1111-4111-8111-111111111111' }),
    })
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.code).toBe('ALREADY_PAID')
  })
})
