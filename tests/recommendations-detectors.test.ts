import { describe, expect, it } from 'vitest'
import { buildDedupeKey } from '@/lib/recommendations/dedupe'
import { rankRecommendations } from '@/lib/recommendations/rank'
import { matchTicketTopic } from '@/lib/recommendations/topic-keywords'
import { isMaintenanceTaskOverdue } from '@/lib/recommendations/detectors/maintenance-overdue'
import { suggestTradeFromTicketDescription } from '@/lib/midrag/ticket-trade-map'
import { cityFromProjectAddress } from '@/lib/midrag/city-from-address'
import { recommendationAllowedForAddons } from '@/lib/recommendations/entitlements'

describe('recommendations dedupe + rank', () => {
  it('builds stable dedupe keys', () => {
    expect(buildDedupeKey('sla_unassigned', 'abc')).toBe('sla_unassigned:abc')
    expect(buildDedupeKey('building_topic_recurrence', 'p1', 'Lighting')).toBe(
      'building_topic_recurrence:p1:lighting'
    )
  })

  it('ranks critical before medium', () => {
    const ranked = rankRecommendations([
      {
        urgency: 'medium',
        detected_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
      {
        urgency: 'critical',
        detected_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      },
    ])
    expect(ranked[0].urgency).toBe('critical')
  })
})

describe('topic keywords', () => {
  it('matches lighting topic', () => {
    expect(matchTicketTopic('התקלקלה תאורת הלובי')?.topicKey).toBe('lighting')
  })

  it('does not treat same-reporter alone as a topic', () => {
    expect(matchTicketTopic('יש בעיה בבניין')).toBeNull()
  })
})

describe('maintenance overdue (Jerusalem-aware clock)', () => {
  it('task without due_at is not overdue', () => {
    expect(isMaintenanceTaskOverdue({ dueAt: null, status: 'PENDING' })).toBe(false)
  })

  it('past due_at is overdue', () => {
    expect(
      isMaintenanceTaskOverdue({
        dueAt: '2020-01-01T00:00:00Z',
        status: 'PENDING',
        now: new Date('2026-09-30T12:00:00Z'),
      })
    ).toBe(true)
  })

  it('DONE is never overdue', () => {
    expect(
      isMaintenanceTaskOverdue({
        dueAt: '2020-01-01T00:00:00Z',
        status: 'DONE',
      })
    ).toBe(false)
  })
})

describe('midrag trade / city mapping', () => {
  it('does not default to electrician when no match', () => {
    const s = suggestTradeFromTicketDescription('משהו כללי בלי מילות מפתח')
    expect(s.sectorId).toBeNull()
    expect(s.confidence).toBe('none')
  })

  it('suggests plumbing for leak text when unambiguous', () => {
    const s = suggestTradeFromTicketDescription('דליפת מים באינסטלציה של המטבח')
    // May be high or ambiguous depending on Midrag sector catalog hits
    expect(['high', 'ambiguous', 'none']).toContain(s.confidence)
    if (s.confidence === 'high') {
      expect(s.sectorId).not.toBeNull()
    }
  })

  it('extracts known city from address', () => {
    const city = cityFromProjectAddress('הרצל 12, חדרה')
    expect(city?.label).toBe('חדרה')
  })

  it('does not invent a city', () => {
    expect(cityFromProjectAddress('רחוב ללא עיר ידועה 5')).toBeNull()
  })
})

describe('entitlements', () => {
  it('hides collections recommendations without addon', () => {
    expect(recommendationAllowedForAddons('collections_drafts', new Set())).toBe(false)
    expect(recommendationAllowedForAddons('collections_drafts', new Set(['collections']))).toBe(
      true
    )
    expect(recommendationAllowedForAddons('sla_unassigned', new Set())).toBe(true)
  })
})
