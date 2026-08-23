import { createHmac } from 'node:crypto'

/**
 * Flow coverage:
 * - Duplicate webhook (same dedupe id / Postgres 23505) exits before side effects — no double tickets / mixed welcome.
 * Additional behaviour is covered in lib/*.test.ts (dedupe ids, address-like heuristics).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const sendWhatsApp = vi.fn()

vi.mock('@/lib/whatsapp-send', () => ({
  sendWhatsAppTextMessage: (...args: unknown[]) => sendWhatsApp(...args),
}))

vi.mock('@/lib/sms-send', () => ({
  sendManagerSMS: vi.fn(),
  sendWorkerSMS: vi.fn(),
  getManagerPhoneFromEnv: vi.fn(),
}))

vi.mock('@/lib/whatsapp-media', () => ({
  downloadWhatsAppMedia: vi.fn(),
  uploadWhatsAppMediaToStorage: vi.fn(),
  createAttachmentRecord: vi.fn(),
}))

vi.mock('@/lib/pending-resident-from-ticket', () => ({
  queuePendingResidentApproval: vi.fn().mockResolvedValue(false),
  reporterListedInProjectResidents: vi.fn().mockResolvedValue(false),
  findOpenPendingResidentProject: vi.fn().mockResolvedValue(null),
}))

const processedKeys = new Set<string>()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'processed_webhooks') {
        return {
          insert: (row: { message_id: string; client_id: string }) => {
            const k = `${row.client_id}:${row.message_id}`
            if (processedKeys.has(k)) {
              return Promise.resolve({ error: { code: '23505' } })
            }
            processedKeys.add(k)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'test-client-id',
                      name: 'Test',
                      sms_sender_name: 'Test',
                      whatsapp_phone_number_id: 'pnid-test-1',
                      whatsapp_access_token: 'tok',
                      manager_phone: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }
      }
      throw new Error(`tests/whatsapp-webhook.post: unexpected table ${table}`)
    },
  }),
}))

function minimalTextPayload(messageId: string | undefined) {
  const msg: Record<string, unknown> = {
    from: '972501234567',
    type: 'text',
    text: { body: 'שלום בדיקת כפילות' },
  }
  if (messageId !== undefined) {
    msg.id = messageId
  }
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'pnid-test-1' },
              messages: [msg],
            },
          },
        ],
      },
    ],
  }
}

describe('POST /api/webhook/whatsapp — duplicate delivery', () => {
  const prev = {
    BAMAKOR_CLIENT_ID: process.env.BAMAKOR_CLIENT_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  }

  beforeEach(() => {
    processedKeys.clear()
    sendWhatsApp.mockClear()
    process.env.BAMAKOR_CLIENT_ID = 'test-client-id'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify'
    process.env.WHATSAPP_APP_SECRET = 'unit-test-meta-secret'
  })

  afterEach(() => {
    process.env.BAMAKOR_CLIENT_ID = prev.BAMAKOR_CLIENT_ID
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev.NEXT_PUBLIC_SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = prev.SUPABASE_SERVICE_ROLE_KEY
    process.env.WHATSAPP_VERIFY_TOKEN = prev.WHATSAPP_VERIFY_TOKEN
    process.env.WHATSAPP_APP_SECRET = prev.WHATSAPP_APP_SECRET
  })

  function signWebhookBody(raw: string) {
    const secret = process.env.WHATSAPP_APP_SECRET || 'unit-test-meta-secret'
    const digest = createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
    return `sha256=${digest}`
  }

  it('POST with message id already in processed_webhooks is ignored and sends no WhatsApp replies', async () => {
    processedKeys.add('test-client-id:wamid.ALREADY_IN_DB')
    const { POST } = await import('@/app/api/webhook/whatsapp/route')
    const payload = minimalTextPayload('wamid.ALREADY_IN_DB')
    const raw = JSON.stringify(payload)

    const res = await POST(
      new NextRequest('http://localhost/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhookBody(raw),
        },
        body: raw,
      })
    )

    expect(res.status).toBe(200)
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})
