import { describe, expect, it } from 'vitest'
import { decideMatch } from '@/lib/bank-match/match-engine'
import type { MatchCandidateCharge } from '@/lib/bank-match/types'

const baseCharge = (
  overrides: Partial<MatchCandidateCharge> & { id: string; amount: number }
): MatchCandidateCharge => ({
  status: 'sent',
  payment_reference: null,
  period_label: '2026-11',
  resident_id: null,
  apartment_number: null,
  resident_name: null,
  bank_transaction_id: null,
  paid_at: null,
  ...overrides,
})

describe('decideMatch', () => {
  it('tier A: BINO reference + amount + unique → auto', () => {
    const decision = decideMatch({
      tx: {
        amount: 400,
        direction: 'credit',
        description: 'העברה BINO-A1B2 דירה 12',
        reference: null,
        counterparty: null,
      },
      charges: [
        baseCharge({
          id: 'c1',
          amount: 400,
          payment_reference: 'BINO-A1B2',
          apartment_number: '12',
        }),
        baseCharge({ id: 'c2', amount: 400, payment_reference: 'BINO-ZZZZ' }),
      ],
    })
    expect(decision).toEqual({
      kind: 'auto',
      chargeId: 'c1',
      confidence: 'A',
      reason: 'payment_reference:BINO-A1B2',
    })
  })

  it('tier B: apartment + amount unique → auto', () => {
    const decision = decideMatch({
      tx: {
        amount: 350,
        direction: 'credit',
        description: 'העברה דירה 5',
        reference: null,
        counterparty: 'שרה כהן',
      },
      charges: [
        baseCharge({
          id: 'c1',
          amount: 350,
          apartment_number: '5',
          resident_name: 'שרה כהן',
        }),
        baseCharge({ id: 'c2', amount: 400, apartment_number: '12' }),
      ],
    })
    expect(decision.kind).toBe('auto')
    if (decision.kind === 'auto') {
      expect(decision.confidence).toBe('B')
      expect(decision.chargeId).toBe('c1')
    }
  })

  it('amount-only unique → suggested (never auto)', () => {
    const decision = decideMatch({
      tx: {
        amount: 400,
        direction: 'credit',
        description: 'העברה כללית',
        reference: null,
        counterparty: null,
      },
      charges: [baseCharge({ id: 'c1', amount: 400 }), baseCharge({ id: 'c2', amount: 200 })],
    })
    expect(decision).toEqual({
      kind: 'suggested',
      chargeId: 'c1',
      confidence: 'C',
      reason: 'amount_only',
    })
  })

  it('ambiguous amount → none', () => {
    const decision = decideMatch({
      tx: {
        amount: 400,
        direction: 'credit',
        description: 'העברה',
        reference: null,
        counterparty: null,
      },
      charges: [baseCharge({ id: 'c1', amount: 400 }), baseCharge({ id: 'c2', amount: 400 })],
    })
    expect(decision.kind).toBe('none')
  })

  it('debit → none', () => {
    const decision = decideMatch({
      tx: {
        amount: 50,
        direction: 'debit',
        description: 'עמלה',
        reference: null,
        counterparty: null,
      },
      charges: [baseCharge({ id: 'c1', amount: 50 })],
    })
    expect(decision).toEqual({ kind: 'none', reason: 'not_credit' })
  })
})
