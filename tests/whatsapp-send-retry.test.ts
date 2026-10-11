import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fetch-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('@/lib/shabbat-messaging-gate', () => ({
  shabbatMessagingBlockReason: () => null,
}))

vi.mock('@/lib/error-logs-db', () => ({
  insertWhatsAppSendFailure: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import {
  sendRawWhatsAppPayloadWithCredentials,
  sendWhatsAppTemplateMessageWithCredentials,
  sendWhatsAppTextMessage,
} from '@/lib/whatsapp-send'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('whatsapp-send transient retry + meta capture', () => {
  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset()
    vi.mocked(insertWhatsAppSendFailure).mockClear()
  })

  it('retries once after timeout and succeeds', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.RETRY_OK' }] }))

    const meta: { current?: { httpStatus: number; message?: string } } = {}
    const result = await sendRawWhatsAppPayloadWithCredentials(
      'phone-id',
      'token',
      { to: '972500000000', type: 'text', text: { body: 'שלום' } },
      meta
    )

    expect(result).toEqual({ messages: [{ id: 'wamid.RETRY_OK' }] })
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(meta.current).toBeUndefined()
  })

  it('does not retry non-transient Meta template errors', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 132001,
            message: 'Template name does not exist in the translation',
          },
        },
        false,
        400
      )
    )

    const meta: { current?: { httpStatus: number; metaCode?: number } } = {}
    const result = await sendRawWhatsAppPayloadWithCredentials(
      'phone-id',
      'token',
      { to: '972500000000', type: 'template', template: { name: 'worker_assignment_notice' } },
      meta
    )

    expect(result).toBeNull()
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(meta.current?.metaCode).toBe(132001)
  })

  it('logs Meta details for text failure even when caller omits metaErrorOut', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(null)

    const result = await sendWhatsAppTextMessage(
      '972500000000',
      'התקלה התקבלה',
      { phoneNumberId: 'phone-id', accessToken: 'token' },
      { clientId: 'client-1' }
    )

    expect(result).toBeNull()
    expect(insertWhatsAppSendFailure).toHaveBeenCalledTimes(1)
    const [, , , message, details] = vi.mocked(insertWhatsAppSendFailure).mock.calls[0]
    expect(message).toContain('timeout/error')
    expect(details).toMatchObject({
      send_kind: 'text',
      meta_http_status: 0,
      meta_error_message: 'timeout',
    })
  })

  it('logs Meta details for worker_assignment_notice when caller omits metaErrorOut', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(null)

    const result = await sendWhatsAppTemplateMessageWithCredentials(
      '972500000000',
      'worker_assignment_notice',
      ['מקור חיים 62', '260', 'תיאור קצר'],
      { phoneNumberId: 'phone-id', accessToken: 'token' },
      'he',
      { clientId: 'client-1' }
    )

    expect(result).toBeNull()
    expect(insertWhatsAppSendFailure).toHaveBeenCalledTimes(1)
    const [, , body, message, details] = vi.mocked(insertWhatsAppSendFailure).mock.calls[0]
    expect(body).toBe('worker_assignment_notice')
    expect(message).toContain('worker_assignment_notice')
    expect(message).toContain('timeout או שגיאת רשת')
    expect(details).toMatchObject({
      send_kind: 'template',
      template_name: 'worker_assignment_notice',
      meta_http_status: 0,
      meta_error_message: 'timeout',
    })
  })
})
