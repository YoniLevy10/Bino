import { afterEach, describe, expect, it } from 'vitest'
import {
  isWhatsAppInboxV2ClientEnabled,
  isWhatsAppInboxV2Enabled,
} from '@/lib/whatsapp/whatsapp-inbox-v2-flag'

const KEYS = ['WHATSAPP_INBOX_V2', 'NEXT_PUBLIC_WHATSAPP_INBOX_V2'] as const

afterEach(() => {
  for (const k of KEYS) delete process.env[k]
})

describe('whatsapp inbox v2 flag', () => {
  it('defaults ON when unset (v2 shipped)', () => {
    expect(isWhatsAppInboxV2ClientEnabled()).toBe(true)
    expect(isWhatsAppInboxV2Enabled()).toBe(true)
  })

  it('reads static NEXT_PUBLIC value for client enablement', () => {
    process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2 = 'true'
    expect(isWhatsAppInboxV2ClientEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2 = '0'
    expect(isWhatsAppInboxV2ClientEnabled()).toBe(false)
  })

  it('server flag accepts WHATSAPP_INBOX_V2 or NEXT_PUBLIC mirror', () => {
    process.env.WHATSAPP_INBOX_V2 = 'yes'
    expect(isWhatsAppInboxV2Enabled()).toBe(true)
    delete process.env.WHATSAPP_INBOX_V2
    process.env.NEXT_PUBLIC_WHATSAPP_INBOX_V2 = 'on'
    expect(isWhatsAppInboxV2Enabled()).toBe(true)
    process.env.WHATSAPP_INBOX_V2 = 'false'
    expect(isWhatsAppInboxV2Enabled()).toBe(false)
  })
})
