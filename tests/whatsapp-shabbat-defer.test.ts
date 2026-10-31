import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
const notifyPlatformOps = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: insertMock,
    }),
  }),
}))

vi.mock('@/lib/platform-ops-alert', () => ({
  notifyPlatformOps,
}))

import {
  insertWhatsAppSendFailure,
  notifyWhatsAppSendRetriesExhausted,
} from '@/lib/error-logs-db'
import { SHABBAT_MESSAGING_BLOCK_REASON } from '@/lib/shabbat-messaging-gate'
import {
  formatWhatsAppTemplateFailureMessage,
  isWhatsAppFreeTextRetry,
  WHATSAPP_SKIP_STATUS_SHABBAT,
} from '@/lib/whatsapp-meta-errors'
import { buildWhatsAppRetryPayload } from '@/lib/whatsapp-retry-payload'

describe('WhatsApp Shabbat defer + free-text reinforce', () => {
  beforeEach(() => {
    insertMock.mockReset()
    notifyPlatformOps.mockReset()
    insertMock.mockResolvedValue({ error: null })
  })

  it('queues Shabbat template skips in error_logs without platform-ops alert', async () => {
    const message = formatWhatsAppTemplateFailureMessage('worker_assignment_notice', {
      httpStatus: 0,
      message: SHABBAT_MESSAGING_BLOCK_REASON,
    })

    await insertWhatsAppSendFailure(
      'client-1',
      '972508946533',
      'worker_assignment_notice',
      message,
      {
        send_kind: 'template',
        template_name: 'worker_assignment_notice',
        meta_http_status: 0,
        meta_error_message: SHABBAT_MESSAGING_BLOCK_REASON,
      }
    )

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.context).toBe('whatsapp_send')
    expect(row.whatsapp_attempts).toBe(1)
    expect(row.details.skip_status).toBe(WHATSAPP_SKIP_STATUS_SHABBAT)
    expect(row.message).toContain('שבת')
    expect(notifyPlatformOps).not.toHaveBeenCalled()
  })

  it('notifyWhatsAppSendRetriesExhausted is a no-op for skipped_shabbat', async () => {
    await notifyWhatsAppSendRetriesExhausted(
      'client-1',
      '972508946533',
      SHABBAT_MESSAGING_BLOCK_REASON,
      { skip_status: WHATSAPP_SKIP_STATUS_SHABBAT, send_kind: 'template' }
    )
    expect(notifyPlatformOps).not.toHaveBeenCalled()
  })

  it('still alerts for non-Shabbat exhausted retries', async () => {
    await notifyWhatsAppSendRetriesExhausted('client-1', '972508946533', 'Meta 132001', {
      send_kind: 'template',
      attempts: 3,
    })
    expect(notifyPlatformOps).toHaveBeenCalledTimes(1)
  })

  it('reinforces ticket_reply free-text never requires template_name', () => {
    const details = {
      send_kind: 'ticket_reply',
      body: 'הנושא יבדק מחר',
      to: '972508946533',
    }
    expect(isWhatsAppFreeTextRetry(details)).toBe(true)
    expect(buildWhatsAppRetryPayload(details)).toEqual({
      to: '972508946533',
      type: 'text',
      text: { body: 'הנושא יבדק מחר' },
    })
  })

  it('formats manager_reply Shabbat skip without timeout wording', () => {
    const msg = formatWhatsAppTemplateFailureMessage('manager_reply', {
      httpStatus: 0,
      message: SHABBAT_MESSAGING_BLOCK_REASON,
    })
    expect(msg).toContain('manager_reply')
    expect(msg).toContain('שבת')
    expect(msg).not.toContain('timeout או שגיאת רשת')
  })
})
