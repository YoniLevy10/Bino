import { describe, it, expect, vi } from 'vitest'
import { webhookDedupeMessageId } from './whatsapp-webhook-dedupe'
import type { ParsedWhatsAppMessage } from './whatsapp-parser'

function baseParsed(overrides: Partial<ParsedWhatsAppMessage> = {}): ParsedWhatsAppMessage {
  return {
    from: '972501234567',
    messageType: 'text',
    textBody: 'עט כחול',
    ...overrides,
  }
}

describe('webhookDedupeMessageId', () => {
  it('uses Meta message id when present (stable across time)', () => {
    const a = baseParsed({ messageId: 'wamid.H_ABC' })
    const b = baseParsed({ messageId: 'wamid.H_ABC', textBody: 'different' })
    expect(webhookDedupeMessageId(a)).toBe('wamid.H_ABC')
    expect(webhookDedupeMessageId(b)).toBe('wamid.H_ABC')
  })

  it('synthetic id is stable within the same 5s bucket', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'))
    const withoutId = baseParsed({ messageId: undefined })
    const first = webhookDedupeMessageId(withoutId)
    vi.setSystemTime(new Date('2026-04-21T12:00:03.000Z'))
    const second = webhookDedupeMessageId(withoutId)
    expect(first).toBe(second)
    expect(first.startsWith('wm:')).toBe(true)
    vi.useRealTimers()
  })

  it('synthetic id changes when the 5s bucket rolls (prevents locking out forever)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:04.000Z'))
    const withoutId = baseParsed({ messageId: undefined, textBody: 'repeat' })
    const a = webhookDedupeMessageId(withoutId)
    vi.setSystemTime(new Date('2026-04-21T12:00:05.000Z'))
    const b = webhookDedupeMessageId(withoutId)
    expect(a).not.toBe(b)
    vi.useRealTimers()
  })

  it('differs for different media id (two images same second)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'))
    const img1 = baseParsed({
      messageType: 'image',
      textBody: '',
      mediaId: 'mid-1',
      mediaType: 'image',
      messageId: undefined,
    })
    const img2 = baseParsed({
      messageType: 'image',
      textBody: '',
      mediaId: 'mid-2',
      mediaType: 'image',
      messageId: undefined,
    })
    expect(webhookDedupeMessageId(img1)).not.toBe(webhookDedupeMessageId(img2))
    vi.useRealTimers()
  })
})
