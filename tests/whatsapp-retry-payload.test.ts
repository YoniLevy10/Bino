import { describe, expect, it } from 'vitest'
import { buildWhatsAppRetryPayload } from '@/lib/whatsapp-retry-payload'
import { isWhatsAppFreeTextRetry } from '@/lib/whatsapp-meta-errors'

describe('buildWhatsAppRetryPayload', () => {
  it('retries ticket_reply free-text without requiring a Meta template name', () => {
    const details = {
      to: '972508946533',
      body: 'הנושא יבדק מחר',
      client_id: '7573f5ad-70e5-4357-8fef-1d96ec38d169',
      send_kind: 'ticket_reply',
      ticket_id: '02333f57-3909-4f7f-a6b4-e1eebb9acc25',
      meta_http_status: 0,
      attempts: 3,
    }

    expect(isWhatsAppFreeTextRetry(details)).toBe(true)

    const payload = buildWhatsAppRetryPayload(details)
    expect(payload).toEqual({
      to: '972508946533',
      type: 'text',
      text: { body: 'הנושא יבדק מחר' },
    })
  })

  it('still builds template payloads when send_kind is template', () => {
    const payload = buildWhatsAppRetryPayload({
      to: '972500000000',
      send_kind: 'template',
      template_name: 'manager_reply',
      template_params: ['דייר', 'עדכון'],
      template_language: 'he',
    })

    expect(payload).toMatchObject({
      to: '972500000000',
      type: 'template',
      template: {
        name: 'manager_reply',
        language: { code: 'he' },
      },
    })
  })

  it('returns null only when template retry lacks a usable template name', () => {
    expect(
      buildWhatsAppRetryPayload({
        to: '972500000000',
        send_kind: 'template',
        body: 'שלום מהמשרד',
      })
    ).toBeNull()
  })

  it('retries legacy text rows (no send_kind) with Hebrew body as text', () => {
    expect(
      buildWhatsAppRetryPayload({
        to: '972500000000',
        body: 'עדכון מהמשרד',
      })
    ).toEqual({
      to: '972500000000',
      type: 'text',
      text: { body: 'עדכון מהמשרד' },
    })
  })
})
