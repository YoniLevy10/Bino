import { describe, expect, it } from 'vitest'
import { buildPilotAnnouncementSms, stripEmojiForSms } from '@/lib/pilot-announcement-message'

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
})
