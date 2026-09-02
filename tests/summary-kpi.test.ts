import { describe, expect, it } from 'vitest'
import {
  computeSummaryRangeKpis,
  countClosedInRange,
  countOpenedInRange,
  summaryPeriodKey,
} from '@/lib/summary-kpi'
import { ticketRangeOrFilter } from '@/lib/summary-tickets'

describe('summaryPeriodKey', () => {
  it('uses stable all/custom keys', () => {
    expect(summaryPeriodKey('all', '', '', null)).toBe('all')
    expect(summaryPeriodKey('custom', '2026-08-01', '2026-08-31', null)).toBe(
      'custom:2026-08-01:2026-08-31'
    )
  })

  it('pins week/month to range start so changing "now" does not bust the key', () => {
    const from = new Date('2026-08-30T21:00:00.000Z')
    const a = summaryPeriodKey('week', '', '', {
      from,
      toExclusive: new Date('2026-09-03T10:00:00.000Z'),
    })
    const b = summaryPeriodKey('week', '', '', {
      from,
      toExclusive: new Date('2026-09-03T22:00:00.000Z'),
    })
    expect(a).toBe(b)
    expect(a).toBe(`week:${from.toISOString()}`)
  })
})

describe('computeSummaryRangeKpis', () => {
  const range = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    toExclusive: new Date('2026-09-04T00:00:00.000Z'),
  }

  const tickets = [
    // opened + closed in range
    { created_at: '2026-09-01T12:00:00.000Z', closed_at: '2026-09-02T12:00:00.000Z' },
    // opened in range, still open
    { created_at: '2026-09-03T01:00:00.000Z', closed_at: null },
    // opened before range, closed in range (in OR fetch set)
    { created_at: '2026-08-20T12:00:00.000Z', closed_at: '2026-09-02T08:00:00.000Z' },
    // outside range entirely
    { created_at: '2026-08-01T12:00:00.000Z', closed_at: '2026-08-02T12:00:00.000Z' },
  ]

  it('counts opened by created_at and closed by closed_at independently', () => {
    expect(countOpenedInRange(tickets, range)).toBe(2)
    expect(countClosedInRange(tickets, range)).toBe(2)
    expect(computeSummaryRangeKpis(tickets, range)).toEqual({
      openedInRange: 2,
      closedInRange: 2,
    })
  })

  it('does not use list length as "opened" (avoids export/UI drift)', () => {
    // Same OR-style list the API returns for the range
    const inRangeOr = tickets.filter((t) => {
      const created = new Date(t.created_at)
      const closed = t.closed_at ? new Date(t.closed_at) : null
      const createdIn = created >= range.from && created < range.toExclusive
      const closedIn = !!closed && closed >= range.from && closed < range.toExclusive
      return createdIn || closedIn
    })
    expect(inRangeOr).toHaveLength(3)
    expect(computeSummaryRangeKpis(inRangeOr, range).openedInRange).toBe(2)
  })
})

describe('ticketRangeOrFilter', () => {
  it('quotes ISO timestamps for PostgREST .or()', () => {
    const from = '1970-01-01T00:00:00.000Z'
    const to = '2026-09-03T12:00:00.000Z'
    expect(ticketRangeOrFilter(from, to)).toBe(
      `and(created_at.gte."${from}",created_at.lt."${to}"),and(closed_at.gte."${from}",closed_at.lt."${to}")`
    )
  })
})
