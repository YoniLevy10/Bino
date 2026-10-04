import { describe, expect, it, vi, beforeEach } from 'vitest'

const authorizeGrowWebhook = vi.hoisted(() => vi.fn())
const getSupabaseAdmin = vi.hoisted(() => vi.fn())
const extractGrowRegisterWebhook = vi.hoisted(() => vi.fn())
const findOtherClientUsingGrowUserId = vi.hoisted(() => vi.fn())
const normalizeGrowUserId = vi.hoisted(() => vi.fn((v: string) => v))

vi.mock('@/lib/grow-webhook', () => ({
  authorizeGrowWebhook,
  expandBracketFormKeys: (o: Record<string, string>) => o,
}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/grow-register', async () => {
  const actual = await vi.importActual<typeof import('@/lib/grow-register')>('@/lib/grow-register')
  return {
    ...actual,
    extractGrowRegisterWebhook,
  }
})
vi.mock('@/lib/grow-credentials', () => ({
  findOtherClientUsingGrowUserId,
  normalizeGrowUserId,
}))
vi.mock('@/lib/logging', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}))

import { POST } from '@/app/api/webhook/grow-register/route'

function mockAdmin(client: Record<string, unknown> | null) {
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: updateEq }))
  const maybeSingle = vi.fn().mockResolvedValue({ data: client, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  getSupabaseAdmin.mockReturnValue({ from })
  return { from, update, updateEq }
}

describe('POST /api/webhook/grow-register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeGrowWebhook.mockReturnValue(true)
    extractGrowRegisterWebhook.mockReturnValue({
      trackingCode: 'lead-1',
      userId: 'grow-user-9',
      apiKey: null,
      businessTitle: 'Test Biz',
      name: null,
      phone: '050',
      packageName: 'basic',
      trackingStatusId: '3',
      trackingStatusMessage: 'הוקם בהצלחה',
      approved: true,
      rejected: false,
    })
    findOtherClientUsingGrowUserId.mockResolvedValue(null)
  })

  it('returns 401 when unauthorized', async () => {
    authorizeGrowWebhook.mockReturnValue(false)
    const res = await POST(
      new Request('http://localhost/api/webhook/grow-register', {
        method: 'POST',
        body: '{}',
      })
    )
    expect(res.status).toBe(401)
  })

  it('approves and binds userId to matching client', async () => {
    const { updateEq } = mockAdmin({
      id: 'client-a',
      grow_user_id: null,
      grow_enabled: false,
      grow_legal_business_name: null,
    })
    const res = await POST(
      new Request('http://localhost/api/webhook/grow-register?token=sec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracking_code: 'lead-1' }),
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('approved')
    expect(updateEq).toHaveBeenCalled()
  })

  it('rejects userId conflict without overwriting other tenant', async () => {
    mockAdmin({
      id: 'client-a',
      grow_user_id: null,
      grow_enabled: false,
      grow_legal_business_name: null,
    })
    findOtherClientUsingGrowUserId.mockResolvedValue({ id: 'other-client' })
    const res = await POST(
      new Request('http://localhost/api/webhook/grow-register?token=sec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracking_code: 'lead-1' }),
      })
    )
    const json = await res.json()
    expect(json.status).toBe('user_id_conflict')
  })

  it('unknown tracking_code matches 0', async () => {
    mockAdmin(null)
    const res = await POST(
      new Request('http://localhost/api/webhook/grow-register?token=sec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracking_code: 'missing' }),
      })
    )
    const json = await res.json()
    expect(json.matched).toBe(0)
    expect(json.reason).toBe('unknown_lead')
  })
})
