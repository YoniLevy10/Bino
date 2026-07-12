import { describe, expect, it } from 'vitest'
import { summaryTicketToDetail, ticketDetailToSummaryRow } from '@/lib/summary-ticket-detail'

describe('summary-ticket-detail', () => {
  it('maps summary row to ticket detail row', () => {
    const row = summaryTicketToDetail({
      id: 'abc',
      ticket_number: 42,
      project_code: 'P1',
      project_name: 'בניין א',
      reporter_phone: '972501234567',
      reporter_name: 'יוני',
      description: 'דליפה',
      status: 'CLOSED',
      priority: 'HIGH',
      assigned_worker_id: 'w1',
      created_at: '2026-01-01T00:00:00Z',
      closed_at: '2026-01-02T00:00:00Z',
    })
    expect(row.id).toBe('abc')
    expect(row.ticket_number).toBe(42)
    expect(row.status).toBe('CLOSED')
    expect(row.project_name).toBe('בניין א')
  })

  it('round-trips summary row through detail mapper', () => {
    const original = {
      id: 'abc',
      ticket_number: 42,
      project_code: 'P1',
      reporter_phone: '972501234567',
      description: 'דליפה',
      status: 'CLOSED',
      assigned_worker_id: 'w1',
      created_at: '2026-01-01T00:00:00Z',
      closed_at: '2026-01-02T00:00:00Z',
    }
    const detail = summaryTicketToDetail(original)
    const back = ticketDetailToSummaryRow(detail)
    expect(back.id).toBe(original.id)
    expect(back.ticket_number).toBe(original.ticket_number)
    expect(back.status).toBe(original.status)
  })
})
