import { describe, expect, it } from 'vitest'
import { isRecentWhatsAppTicketReport } from '@/lib/whatsapp-ticket-reply'

describe('isRecentWhatsAppTicketReport', () => {
  it('returns true for whatsapp ticket within 24h', () => {
    const created = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(isRecentWhatsAppTicketReport({ source: 'whatsapp', created_at: created })).toBe(true)
  })

  it('returns false for old or non-whatsapp tickets', () => {
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString()
    expect(isRecentWhatsAppTicketReport({ source: 'whatsapp', created_at: old })).toBe(false)
    expect(isRecentWhatsAppTicketReport({ source: 'web', created_at: old })).toBe(false)
    expect(isRecentWhatsAppTicketReport(null)).toBe(false)
  })
})
