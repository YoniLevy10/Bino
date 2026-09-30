import { describe, expect, it } from 'vitest'
import {
  deriveTrackingState,
  interestTone,
  mapLegacyStatusToStage,
  stageLabelHe,
} from '@/lib/sales-leads/funnel/model'
import { jerusalemDayBounds } from '@/lib/sales-leads/funnel/timezone'
import { parseSalesOperatorsEnv } from '@/lib/sales-leads/operators'

describe('sales lead funnel model', () => {
  it('maps legacy statuses without inventing interest', () => {
    expect(mapLegacyStatusToStage('discovered')).toBe('new')
    expect(mapLegacyStatusToStage('qualified')).toBe('new')
    expect(mapLegacyStatusToStage('contacted')).toBe('contact_attempt')
    expect(mapLegacyStatusToStage('won')).toBe('customer')
    expect(mapLegacyStatusToStage('do_not_contact')).toBe('lost')
    expect(mapLegacyStatusToStage('rejected')).toBe('deferred')
  })

  it('keeps interest tone independent of no-answer semantics', () => {
    expect(interestTone('unknown')).toBe('gray')
    expect(interestTone('undecided')).toBe('yellow')
    expect(interestTone('interested')).toBe('green')
    expect(interestTone('not_interested')).toBe('red')
  })

  it('labels stages in Hebrew with text (not color-only)', () => {
    expect(stageLabelHe('contact_attempt')).toContain('קשר')
    expect(stageLabelHe('customer')).toBe('לקוח')
  })

  it('marks overdue from next action before Jerusalem day start', () => {
    const bounds = jerusalemDayBounds(new Date('2026-06-15T10:00:00+03:00'))
    expect(
      deriveTrackingState({
        stage: 'contact_attempt',
        nextActionAt: '2026-06-14T08:00:00.000Z',
        dayStartIso: bounds.dayStartIso,
        dayEndIso: bounds.dayEndIso,
      }),
    ).toBe('overdue')
  })

  it('marks due_today inside Jerusalem calendar day', () => {
    const bounds = jerusalemDayBounds(new Date('2026-06-15T10:00:00+03:00'))
    const midDay = new Date(
      (bounds.dayStart.getTime() + bounds.dayEnd.getTime()) / 2,
    ).toISOString()
    expect(
      deriveTrackingState({
        stage: 'new',
        nextActionAt: midDay,
        dayStartIso: bounds.dayStartIso,
        dayEndIso: bounds.dayEndIso,
      }),
    ).toBe('due_today')
  })

  it('does not treat closed stages as overdue', () => {
    const bounds = jerusalemDayBounds()
    expect(
      deriveTrackingState({
        stage: 'lost',
        nextActionAt: '2000-01-01T00:00:00.000Z',
        dayStartIso: bounds.dayStartIso,
        dayEndIso: bounds.dayEndIso,
      }),
    ).toBe('closed')
  })

  it('waiting with past check date is overdue, not not-interested', () => {
    const bounds = jerusalemDayBounds(new Date('2026-06-15T10:00:00+03:00'))
    expect(
      deriveTrackingState({
        stage: 'proposal_sent',
        nextActionAt: null,
        waitingForReply: true,
        waitingUntil: '2026-06-10T00:00:00.000Z',
        dayStartIso: bounds.dayStartIso,
        dayEndIso: bounds.dayEndIso,
      }),
    ).toBe('overdue')
  })
})

describe('jerusalem day bounds', () => {
  it('handles winter IST around midnight', () => {
    // 2026-01-15 00:30 Asia/Jerusalem = 2026-01-14 22:30 UTC (IST = UTC+2)
    const bounds = jerusalemDayBounds(new Date('2026-01-14T22:30:00.000Z'))
    expect(bounds.ymd).toBe('2026-01-15')
    expect(bounds.dayStartIso < bounds.dayEndIso).toBe(true)
  })

  it('handles summer IDT (UTC+3)', () => {
    const bounds = jerusalemDayBounds(new Date('2026-07-01T21:30:00.000Z'))
    expect(bounds.ymd).toBe('2026-07-02')
  })
})

describe('sales operators env', () => {
  it('parses JSON roster', () => {
    const ops = parseSalesOperatorsEnv(
      JSON.stringify([
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'A',
          email: 'a@example.com',
        },
        { id: '22222222-2222-2222-2222-222222222222', name: 'B' },
      ]),
    )
    expect(ops).toHaveLength(2)
    expect(ops[0].name).toBe('A')
    expect(ops[1].email).toBeNull()
  })

  it('parses csv uuid:name:email', () => {
    const ops = parseSalesOperatorsEnv(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:Yoni:y@x.com,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:Lial',
    )
    expect(ops).toHaveLength(2)
    expect(ops[0].email).toBe('y@x.com')
    expect(ops[1].name).toBe('Lial')
  })

  it('returns empty when unset', () => {
    expect(parseSalesOperatorsEnv('')).toEqual([])
    expect(parseSalesOperatorsEnv(undefined)).toEqual([])
  })
})
