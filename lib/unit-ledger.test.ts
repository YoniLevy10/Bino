import { describe, expect, it } from 'vitest'
import {
  chargeRemaining,
  computeRunningBalances,
  ledgerIdempotencyKey,
  roundMoney,
  shouldMarkChargePaid,
  signedAmountForEntryType,
  sumPaymentsTowardCharge,
  sumSignedAmounts,
} from '@/lib/unit-ledger'

describe('unit ledger balance math', () => {
  it('signs charge vs payment/credit/reversal', () => {
    expect(signedAmountForEntryType('charge', 100)).toBe(100)
    expect(signedAmountForEntryType('payment', 40)).toBe(-40)
    expect(signedAmountForEntryType('credit', 10.5)).toBe(-10.5)
    expect(signedAmountForEntryType('reversal', 100)).toBe(-100)
  })

  it('rejects non-positive amounts', () => {
    expect(() => signedAmountForEntryType('charge', 0)).toThrow()
    expect(() => signedAmountForEntryType('payment', -5)).toThrow()
  })

  it('computes running balance: charge → partial → credit → settle', () => {
    const withBal = computeRunningBalances([
      { signed_amount: 300, id: 'c1' },
      { signed_amount: -100, id: 'p1' },
      { signed_amount: -50, id: 'cr' },
      { signed_amount: -150, id: 'p2' },
    ])
    expect(withBal.map((e) => e.running_balance)).toEqual([300, 200, 150, 0])
    expect(sumSignedAmounts(withBal)).toBe(0)
  })

  it('tracks remaining after partial payments toward a charge', () => {
    const entries = [
      { entry_type: 'charge', amount: 200, charge_id: 'ch1' },
      { entry_type: 'payment', amount: 80, charge_id: 'ch1' },
      { entry_type: 'payment', amount: 50, charge_id: 'ch1' },
      { entry_type: 'payment', amount: 20, charge_id: 'other' },
    ]
    const paid = sumPaymentsTowardCharge(entries, 'ch1')
    expect(paid).toBe(130)
    expect(chargeRemaining(200, paid)).toBe(70)
    expect(shouldMarkChargePaid(200, paid)).toBe(false)
    expect(shouldMarkChargePaid(200, 200)).toBe(true)
    expect(chargeRemaining(200, 250)).toBe(0)
  })

  it('rounds money to agorot', () => {
    expect(roundMoney(10.005)).toBe(10.01)
    expect(roundMoney(10.004)).toBe(10)
  })
})

describe('unit ledger idempotency keys', () => {
  it('builds stable keys for charge / grow / manual / partial', () => {
    const chargeId = '11111111-1111-4111-8111-111111111111'
    expect(ledgerIdempotencyKey('charge', chargeId)).toBe(`charge:${chargeId}`)
    expect(ledgerIdempotencyKey('grow_paid', chargeId)).toBe(`grow_paid:${chargeId}`)
    expect(ledgerIdempotencyKey('manual_paid', chargeId)).toBe(`manual_paid:${chargeId}`)
    expect(ledgerIdempotencyKey('partial', chargeId, 'client-key-1')).toBe(
      `partial:${chargeId}:client-key-1`
    )
    expect(ledgerIdempotencyKey('synced_paid', chargeId)).toBe(`synced_paid:${chargeId}`)
  })

  it('same key implies one logical payment (no double-count)', () => {
    const keyA = ledgerIdempotencyKey('grow_paid', 'ch-1')
    const keyB = ledgerIdempotencyKey('grow_paid', 'ch-1')
    expect(keyA).toBe(keyB)
    // Distinct sources must not collide
    expect(ledgerIdempotencyKey('manual_paid', 'ch-1')).not.toBe(keyA)
    expect(ledgerIdempotencyKey('partial', 'ch-1', 'a')).not.toBe(
      ledgerIdempotencyKey('partial', 'ch-1', 'b')
    )
  })
})
