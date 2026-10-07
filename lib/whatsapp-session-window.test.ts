import { describe, expect, it } from 'vitest'
import { inboundIsWithinWhatsAppSession } from '@/lib/whatsapp-message-store'

const NOW = Date.parse('2026-10-08T00:00:00.000Z')

describe('inboundIsWithinWhatsAppSession', () => {
  it('keeps free-text open for a message from the last day', () => {
    const createdAt = new Date(NOW - 23 * 60 * 60 * 1000).toISOString()
    expect(inboundIsWithinWhatsAppSession(createdAt, NOW)).toBe(true)
  })

  it('closes free-text after 24 hours', () => {
    const createdAt = new Date(NOW - 25 * 60 * 60 * 1000).toISOString()
    expect(inboundIsWithinWhatsAppSession(createdAt, NOW)).toBe(false)
  })
})
