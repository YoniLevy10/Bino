import { describe, it, expect, vi } from 'vitest'
import {
  findOpenTicketForPhone,
  findDuplicateOpenWhatsAppTicket,
  normalizeTicketDescriptionForCompare,
  parseRecentDuplicateWhatsAppTicketError,
  isBenignWhatsAppTicketDuplicateError,
  readLastReporterProject,
} from '@/lib/whatsapp-webhook/flow-ticket'

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

function mockSupabaseDuplicateTickets(rows: unknown[], error: unknown = null) {
  const chain = {
    eq: () => chain,
    is: () => chain,
    neq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error }),
  }
  return {
    from: () => ({
      select: () => chain,
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

describe('duplicate WhatsApp ticket helpers', () => {
  it('normalizes descriptions for comparison', () => {
    expect(normalizeTicketDescriptionForCompare('  דליפה   במטבח  ')).toBe('דליפה במטבח')
  })

  it('parses recent_duplicate_whatsapp_ticket errors', () => {
    expect(parseRecentDuplicateWhatsAppTicketError('recent_duplicate_whatsapp_ticket:29')).toBe(29)
    expect(isBenignWhatsAppTicketDuplicateError('recent_duplicate_whatsapp_ticket:29')).toBe(true)
    expect(parseRecentDuplicateWhatsAppTicketError('other error')).toBeNull()
  })

  it('finds open ticket with same description', async () => {
    const supabase = mockSupabaseDuplicateTickets([
      {
        id: 'ticket-29',
        ticket_number: 29,
        description: 'דליפה במטבח',
      },
      {
        id: 'ticket-30',
        ticket_number: 30,
        description: 'נזילה אחרת',
      },
    ])
    const found = await findDuplicateOpenWhatsAppTicket(
      '972587449330',
      'client-1',
      '  דליפה במטבח ',
      supabase as never
    )
    expect(found).toEqual({ id: 'ticket-29', ticket_number: 29 })
  })
})

describe('readLastReporterProject', () => {
  it('returns latest project for reporter phone', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'tickets') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    not: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({
                            data: { project_id: 'proj-1' },
                            error: null,
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
        if (table === 'projects') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { name: 'בניין א' }, error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      },
    }

    const result = await readLastReporterProject(supabase as never, 'client-1', '972501234567')
    expect(result).toEqual({ projectId: 'proj-1', projectName: 'בניין א' })
  })
})
