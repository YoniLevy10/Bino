import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/whatsapp-send', () => ({
  sendWhatsAppTextMessage: vi.fn(),
}))

vi.mock('@/lib/sms-send', () => ({
  sendManagerSMS: vi.fn(),
  sendWorkerSMS: vi.fn(),
  getManagerPhoneFromEnv: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      throw new Error('should not reach DB without signature')
    },
  }),
}))

describe('POST /api/webhook/whatsapp — signature required', () => {
  const prev = {
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    vi.resetModules()
  })

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = prev.WHATSAPP_APP_SECRET
    process.env.WHATSAPP_VERIFY_TOKEN = prev.WHATSAPP_VERIFY_TOKEN
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev.NEXT_PUBLIC_SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SUPABASE_SERVICE_ROLE_KEY
  })

  it('returns 503 when WHATSAPP_APP_SECRET is unset', async () => {
    delete process.env.WHATSAPP_APP_SECRET
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const raw = JSON.stringify({ entry: [] })
    const res = await POST(
      new NextRequest('http://localhost/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      })
    )
    expect(res.status).toBe(503)
  })

  it('returns 403 for invalid signature', async () => {
    process.env.WHATSAPP_APP_SECRET = 'unit-test-meta-secret'
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const raw = JSON.stringify({ entry: [] })
    const res = await POST(
      new NextRequest('http://localhost/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=deadbeef',
        },
        body: raw,
      })
    )
    expect(res.status).toBe(403)
  })
})
