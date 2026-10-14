import { describe, expect, it } from 'vitest'
import { suggestWorkerForTicket } from '@/lib/recommendations/suggest-worker'

const workers = [
  { id: 'w-plumbing', full_name: 'יוסי אינסטלטור', is_active: true },
  { id: 'w-electric', full_name: 'דני חשמלאי', is_active: true },
  { id: 'w-default', full_name: 'עובד ברירת מחדל', is_active: true },
]

describe('suggestWorkerForTicket', () => {
  it('prefers same-topic history in the building', () => {
    const result = suggestWorkerForTicket({
      ticket: {
        id: 't-new',
        project_id: 'p1',
        description: 'סתימה בכיור במטבח',
        assigned_worker_id: null,
        status: 'NEW',
      },
      history: [
        {
          id: 't1',
          project_id: 'p1',
          description: 'נזילה מברז',
          assigned_worker_id: 'w-plumbing',
          status: 'CLOSED',
        },
        {
          id: 't2',
          project_id: 'p1',
          description: 'סתימה בביוב',
          assigned_worker_id: 'w-plumbing',
          status: 'CLOSED',
        },
        {
          id: 't3',
          project_id: 'p1',
          description: 'קצר בלוח חשמל',
          assigned_worker_id: 'w-electric',
          status: 'CLOSED',
        },
      ],
      workers,
      projectDefaultWorkerId: 'w-default',
    })
    expect(result?.workerId).toBe('w-plumbing')
    expect(result?.source).toBe('topic_history')
    expect(result?.reasonHe).toMatch(/אינסטלציה/)
  })

  it('falls back to building history when topic is ambiguous', () => {
    const result = suggestWorkerForTicket({
      ticket: {
        id: 't-new',
        project_id: 'p1',
        description: 'משהו כללי בלי נושא ברור',
        assigned_worker_id: null,
        status: 'NEW',
      },
      history: [
        {
          id: 't1',
          project_id: 'p1',
          description: 'תיקון כללי',
          assigned_worker_id: 'w-electric',
          status: 'CLOSED',
        },
        {
          id: 't2',
          project_id: 'p1',
          description: 'עוד תיקון',
          assigned_worker_id: 'w-electric',
          status: 'CLOSED',
        },
      ],
      workers,
      projectDefaultWorkerId: 'w-default',
    })
    expect(result?.workerId).toBe('w-electric')
    expect(result?.source).toBe('building_history')
  })

  it('uses project default when no history', () => {
    const result = suggestWorkerForTicket({
      ticket: {
        id: 't-new',
        project_id: 'p1',
        description: 'נזילה',
        assigned_worker_id: null,
        status: 'NEW',
      },
      history: [],
      workers,
      projectDefaultWorkerId: 'w-default',
    })
    expect(result?.workerId).toBe('w-default')
    expect(result?.source).toBe('project_default')
    expect(result?.reasonHe).toMatch(/ברירת מחדל/)
  })

  it('returns null when already assigned or no workers', () => {
    expect(
      suggestWorkerForTicket({
        ticket: {
          id: 't1',
          project_id: 'p1',
          description: 'נזילה',
          assigned_worker_id: 'w-plumbing',
          status: 'ASSIGNED',
        },
        history: [],
        workers,
      })
    ).toBeNull()

    expect(
      suggestWorkerForTicket({
        ticket: {
          id: 't1',
          project_id: 'p1',
          description: 'נזילה',
          assigned_worker_id: null,
          status: 'NEW',
        },
        history: [],
        workers: [],
      })
    ).toBeNull()
  })
})
