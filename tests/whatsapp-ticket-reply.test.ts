import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendResident = vi.fn()

vi.mock('@/lib/whatsapp-resident-outbound', () => ({
  sendResidentTextOrTemplate: (...args: unknown[]) => mockSendResident(...args),
}))

vi.mock('@/lib/whatsapp-inbox-context', () => ({
  loadWhatsAppInboxContext: vi.fn().mockResolvedValue({}),
  managerReplyTemplateParams: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/meta-whatsapp-pending-actions', () => ({
  metaTemplateNameManagerReply: () => 'manager_reply',
}))

vi.mock('@/lib/whatsapp-message-store', () => ({
  isWithinWhatsAppSessionWindow: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/sms-send', () => ({
  sendResidentSMS: vi.fn().mockResolvedValue(false),
}))

import { sendTicketResidentWhatsAppReply } from '@/lib/whatsapp-ticket-reply'

function makeAdmin(reporterPhone: string | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'tickets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                reporter_phone: reporterPhone,
                ticket_number: 42,
                source: 'whatsapp',
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }
      }
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                whatsapp_phone_number_id: 'pn-1',
                whatsapp_access_token: 'token-1',
              },
              error: null,
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('sendTicketResidentWhatsAppReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendResident.mockResolvedValue({ sent: true, mode: 'text' })
  })

  it('sends worker/manager reply to resident phone', async () => {
    const admin = makeAdmin('972501234567')
    const result = await sendTicketResidentWhatsAppReply(admin as never, {
      clientId: 'c1',
      ticketId: 't1',
      body: 'הטכנאי בדרך',
    })

    expect(result.sent).toBe(true)
    expect(result.reporterPhone).toBe('972501234567')
    expect(mockSendResident).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'c1',
        phone: '972501234567',
        textBody: 'הטכנאי בדרך',
        ticketId: 't1',
      })
    )
  })

  it('fails when ticket has no resident phone', async () => {
    const admin = makeAdmin(null)
    const result = await sendTicketResidentWhatsAppReply(admin as never, {
      clientId: 'c1',
      ticketId: 't1',
      body: 'שלום',
    })

    expect(result.sent).toBe(false)
    expect(mockSendResident).not.toHaveBeenCalled()
  })
})
