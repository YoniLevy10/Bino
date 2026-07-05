import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendImage = vi.fn()
const mockNotifyClosed = vi.fn()
const mockSignedUrl = vi.fn()

vi.mock('@/lib/whatsapp-ticket-reply', () => ({
  sendTicketResidentWhatsAppImage: (...args: unknown[]) => mockSendImage(...args),
}))

vi.mock('@/lib/reporter-ticket-closed-notify', () => ({
  notifyReporterIfTicketNewlyClosed: (...args: unknown[]) => mockNotifyClosed(...args),
}))

vi.mock('@/lib/ticket-attachment-url', () => ({
  createServerSignedAttachmentUrl: (...args: unknown[]) => mockSignedUrl(...args),
}))

import { completeWorkerTicketWithPhoto } from '@/lib/worker-ticket-complete'

function makeAdmin(opts: {
  ticketStatus?: string
  existingCompletion?: { id: string; file_url: string; mime_type: string } | null
}) {
  const ticketUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 't1', status: 'CLOSED' }, error: null }),
  })

  return {
    from: vi.fn((table: string) => {
      if (table === 'tickets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 't1', status: opts.ticketStatus ?? 'IN_PROGRESS' },
              error: null,
            }),
          }),
          update: ticketUpdate,
        }
      }
      if (table === 'ticket_attachments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: opts.existingCompletion ?? null, error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'a1', file_url: 't1/new.jpg', mime_type: 'image/jpeg' },
              error: null,
            }),
          }),
        }
      }
      if (table === 'ticket-attachments') {
        return {
          upload: vi.fn().mockResolvedValue({ error: null }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    }),
  }
}

describe('completeWorkerTicketWithPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignedUrl.mockResolvedValue('https://signed.example/photo.jpg')
    mockSendImage.mockResolvedValue({ sent: true, reporterPhone: '972501234567', mode: 'text_image' })
    mockNotifyClosed.mockResolvedValue({
      whatsappSent: true,
      smsSent: false,
      reporterHasPhone: true,
    })
  })

  it('sends completion image then closes ticket and notifies resident', async () => {
    const admin = makeAdmin({
      existingCompletion: { id: 'a1', file_url: 't1/photo.jpg', mime_type: 'image/jpeg' },
    })

    const result = await completeWorkerTicketWithPhoto(admin as never, {
      clientId: 'c1',
      workerId: 'w1',
      ticketId: 't1',
    })

    expect(mockSendImage).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        clientId: 'c1',
        ticketId: 't1',
        imageLink: 'https://signed.example/photo.jpg',
      })
    )
    expect(mockNotifyClosed).toHaveBeenCalled()
    expect(result.completion_image_sent).toBe(true)
    expect(result.whatsapp_sent).toBe(true)
  })

  it('closes ticket without photo when none staged', async () => {
    const admin = makeAdmin({ existingCompletion: null })

    const result = await completeWorkerTicketWithPhoto(admin as never, {
      clientId: 'c1',
      workerId: 'w1',
      ticketId: 't1',
    })

    expect(mockSendImage).not.toHaveBeenCalled()
    expect(mockNotifyClosed).toHaveBeenCalled()
    expect(result.completion_image_sent).toBe(false)
    expect(result.attachment_id).toBeNull()
    expect(result.whatsapp_sent).toBe(true)
  })

  it('still closes ticket when image send fails', async () => {
    mockSendImage.mockResolvedValue({
      sent: false,
      reporterPhone: '972501234567',
      errorMessage: 'Meta error',
    })
    const admin = makeAdmin({
      existingCompletion: { id: 'a1', file_url: 't1/photo.jpg', mime_type: 'image/jpeg' },
    })

    const result = await completeWorkerTicketWithPhoto(admin as never, {
      clientId: 'c1',
      workerId: 'w1',
      ticketId: 't1',
    })

    expect(result.completion_image_sent).toBe(false)
    expect(result.completion_image_error).toBe('Meta error')
    expect(result.whatsapp_sent).toBe(true)
  })
})
