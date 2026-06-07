import { describe, expect, it } from 'vitest'
import { buildPilotAnnouncementSms, resolvePilotSmsMessage, stripEmojiForSms } from '@/lib/pilot-announcement-message'

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

  it('uses custom message when provided', () => {
    expect(resolvePilotSmsMessage('Hello tenants')).toBe('Hello tenants')
  })

  it('falls back to default when custom is blank', () => {
    expect(resolvePilotSmsMessage('   ')).toBe(buildPilotAnnouncementSms())
  })
})
