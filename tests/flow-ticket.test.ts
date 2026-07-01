import { describe, it, expect, vi } from 'vitest'
import { findOpenTicketForPhone } from '@/lib/whatsapp-webhook/flow-ticket'

function mockSupabaseTickets(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              neq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve(result),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

describe('findOpenTicketForPhone', () => {
  it('returns most recent open ticket without a time window', async () => {
    const ticket = {
      id: 'ticket-27',
      status: 'NEW',
      created_at: '2026-06-01T10:00:00.000Z',
    }
    const supabase = mockSupabaseTickets({ data: ticket, error: null })

    const found = await findOpenTicketForPhone('972501234567', supabase as never, 'client-1')

    expect(found).toEqual(ticket)
  })

  it('returns null when query fails or no row', async () => {
    const supabase = mockSupabaseTickets({ data: null, error: { message: 'db error' } })
    const found = await findOpenTicketForPhone('972501234567', supabase as never, 'client-1')
    expect(found).toBeNull()
  })
})
