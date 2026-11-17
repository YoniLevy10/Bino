import { describe, expect, it } from 'vitest'
import {
  aggregateGrowPeriodCard,
  chargeDateKey,
  effectivePaidAt,
  GROW_PERIOD_LABELS,
  isDateKeyInPeriod,
} from '@/lib/building-finance/grow-period-card'

const period = { startDate: '2026-07-01', endDate: '2026-09-30' }

describe('chargeDateKey / isDateKeyInPeriod', () => {
  it('extracts YYYY-MM-DD', () => {
    expect(chargeDateKey('2026-08-15T12:00:00.000Z')).toBe('2026-08-15')
    expect(chargeDateKey(null)).toBeNull()
  })

  it('checks inclusive period bounds', () => {
    expect(isDateKeyInPeriod('2026-07-01', period)).toBe(true)
    expect(isDateKeyInPeriod('2026-09-30', period)).toBe(true)
    expect(isDateKeyInPeriod('2026-06-30', period)).toBe(false)
  })
})

describe('effectivePaidAt', () => {
  it('prefers paid_at then updated_at then created_at', () => {
    expect(
      effectivePaidAt({
        paid_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
        created_at: '2026-06-01T00:00:00.000Z',
      })
    ).toEqual({ iso: '2026-08-01T00:00:00.000Z', basis: 'paid_at' })

    expect(
      effectivePaidAt({
        paid_at: null,
        updated_at: '2026-07-10T00:00:00.000Z',
        created_at: '2026-06-01T00:00:00.000Z',
      })
    ).toEqual({ iso: '2026-07-10T00:00:00.000Z', basis: 'updated_at' })

    expect(
      effectivePaidAt({
        paid_at: null,
        updated_at: null,
        created_at: '2026-06-01T00:00:00.000Z',
      })
    ).toEqual({ iso: '2026-06-01T00:00:00.000Z', basis: 'created_at' })
  })
})

describe('aggregateGrowPeriodCard', () => {
  it('collects by paid_at even when created earlier; bills by created_at', () => {
    const card = aggregateGrowPeriodCard(
      [
        {
          // created before period, paid in period → collected only
          status: 'paid',
          amount: 100,
          paid_at: '2026-08-05T10:00:00.000Z',
          updated_at: '2026-08-05T10:00:00.000Z',
          created_at: '2026-05-01T00:00:00.000Z',
        },
        {
          // created in period, unpaid → billed + outstanding
          status: 'sent',
          amount: 50,
          paid_at: null,
          updated_at: '2026-07-02T00:00:00.000Z',
          created_at: '2026-07-02T00:00:00.000Z',
        },
        {
          // created in period, paid later → billed only (not collected this period)
          status: 'paid',
          amount: 75,
          paid_at: '2026-10-15T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
          created_at: '2026-08-01T00:00:00.000Z',
        },
        {
          status: 'cancelled',
          amount: 999,
          paid_at: null,
          created_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      period
    )

    expect(card.collected).toBe(100)
    expect(card.billed).toBe(125) // 50 + 75
    expect(card.outstanding).toBe(50)
    expect(card.labels).toEqual(GROW_PERIOD_LABELS)
    expect(card.collected_date_basis).toBe('paid_at')
  })

  it('falls back to updated_at when paid_at missing on paid charge', () => {
    const card = aggregateGrowPeriodCard(
      [
        {
          status: 'paid',
          amount: 200,
          paid_at: null,
          updated_at: '2026-08-20T00:00:00.000Z',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      period
    )
    expect(card.collected).toBe(200)
    expect(card.billed).toBe(0)
    expect(card.collected_date_basis).toBe('updated_at')
  })
})
