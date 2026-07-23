import { describe, expect, it } from 'vitest'
import {
  buildPilotAnnouncementSms,
  formatIsraeliMobileDisplay,
  resolvePilotSmsMessage,
  stripEmojiForSms,
} from '@/lib/pilot-announcement-message'

describe('pilot announcement SMS', () => {
  it('removes emoji', () => {
    expect(stripEmojiForSms('hello 😃 world')).toBe('hello  world')
  })

  it('builds multilingual message without emoji', () => {
    const msg = buildPilotAnnouncementSms()
    expect(msg).toContain('במקור')
    expect(msg).toContain('Bamakor')
    expect(msg).toContain('Bonjour')
    expect(msg).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('includes WhatsApp bot number when provided', () => {
    const msg = buildPilotAnnouncementSms({ whatsappBotPhone: '0501234567' })
    expect(msg).toContain('0501234567')
    expect(msg).toContain('https://wa.me/972501234567')
    expect(msg).toContain('אל תשלחו למספר אחר')
  })

  it('formats 972 numbers as local mobile', () => {
    expect(formatIsraeliMobileDisplay('972559899132')).toBe('0559899132')
  })

  it('uses custom message when provided', () => {
    expect(resolvePilotSmsMessage('Hello tenants')).toBe('Hello tenants')
  })

  it('falls back to default when custom is blank', () => {
    expect(resolvePilotSmsMessage('   ', { whatsappBotPhone: '0501111111' })).toBe(
      buildPilotAnnouncementSms({ whatsappBotPhone: '0501111111' })
    )
  })
})
