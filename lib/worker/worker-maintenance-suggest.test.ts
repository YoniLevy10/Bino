import { describe, expect, it } from 'vitest'
import { suggestMaintenanceFromTickets } from './worker-maintenance-suggest'

const pump = (n: number, created_at: string) => ({
  id: `t-${n}`,
  ticket_number: n,
  description: 'משאבת מים לא עובדת בקומה',
  project_id: 'p-1',
  project_name: 'הדר',
  created_at,
})

describe('suggestMaintenanceFromTickets', () => {
  it('returns null when one building has fewer than two tickets', () => {
    expect(
      suggestMaintenanceFromTickets([
        pump(1, '2026-01-01'),
        { ...pump(2, '2026-01-02'), project_id: 'p-2', project_name: 'אחר' },
      ])
    ).toBeNull()
  })

  it('suggests a preventive task from the building with the most assigned tickets', () => {
    const suggestion = suggestMaintenanceFromTickets([
      pump(11, '2026-02-01T00:00:00Z'),
      pump(12, '2026-03-01T00:00:00Z'),
      pump(13, '2026-04-01T00:00:00Z'),
      { ...pump(20, '2026-05-01T00:00:00Z'), project_id: 'p-2', description: 'דלת' },
    ])
    expect(suggestion?.project_id).toBe('p-1')
    expect(suggestion?.priority).toBe('HIGH')
    expect(suggestion?.title).toContain('משאבת')
    expect(suggestion?.source_ticket_id).toBe('t-13')
    expect(suggestion?.reason).toContain('משאבת')
  })
})