import { describe, it, expect } from 'vitest'
import { isWhatsAppMessageInTicketMediaWindow } from './whatsapp-recover-stashed-media'

describe('isWhatsAppMessageInTicketMediaWindow', () => {
  const ticketAt = '2026-07-03T09:00:00.000Z'

  it('accepts video sent 30 minutes before ticket', () => {
    expect(
      isWhatsAppMessageInTicketMediaWindow('2026-07-03T08:30:00.000Z', ticketAt)
    ).toBe(true)
  })

  it('rejects video from previous day', () => {
    expect(
      isWhatsAppMessageInTicketMediaWindow('2026-07-02T09:00:00.000Z', ticketAt)
    ).toBe(false)
  })

  it('accepts media up to 30 minutes after ticket open', () => {
    expect(
      isWhatsAppMessageInTicketMediaWindow('2026-07-03T09:20:00.000Z', ticketAt)
    ).toBe(true)
  })
})
