import { extractPaymentReference } from '@/lib/bank-match/payment-reference'
import type {
  MatchCandidateCharge,
  MatchDecision,
  NormalizedBankTransaction,
} from '@/lib/bank-match/types'

function norm(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.009
}

function textHasApartment(hay: string, apt: string | null | undefined): boolean {
  if (!apt) return false
  const a = apt.trim()
  if (!a) return false
  const h = hay
  // דירה 12 / דירת 12 / apt 12 / #12
  const patterns = [
    new RegExp(`(?:דיר[הת]?\\s*מ?\\s*|apt\\.?\\s*|#\\s*)${escapeRe(a)}\\b`, 'i'),
    new RegExp(`\\b${escapeRe(a)}\\b`),
  ]
  return patterns.some((p) => p.test(h))
}

function textHasName(hay: string, name: string | null | undefined): boolean {
  if (!name) return false
  const parts = norm(name).split(' ').filter((p) => p.length >= 2)
  if (parts.length === 0) return false
  const h = norm(hay)
  // Require full name or at least two significant tokens
  if (parts.length >= 2) {
    return parts.every((p) => h.includes(p))
  }
  return h.includes(parts[0])
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function openCharges(charges: MatchCandidateCharge[]): MatchCandidateCharge[] {
  return charges.filter(
    (c) =>
      (c.status === 'sent' || c.status === 'draft') &&
      !c.bank_transaction_id &&
      !c.paid_at
  )
}

/**
 * Decide match for a single credit transaction against open charges.
 * Tier A: BINO-XXXX + amount + unique.
 * Tier B: apartment/name + amount + unique open charge in building.
 * Else: none (or weak suggested if exactly one amount match — still manual).
 */
export function decideMatch(params: {
  tx: Pick<
    NormalizedBankTransaction,
    'amount' | 'direction' | 'description' | 'reference' | 'counterparty'
  >
  charges: MatchCandidateCharge[]
}): MatchDecision {
  const { tx, charges } = params
  if (tx.direction !== 'credit') {
    return { kind: 'none', reason: 'not_credit' }
  }

  const open = openCharges(charges)
  const hay = `${tx.description || ''} ${tx.reference || ''} ${tx.counterparty || ''}`

  const ref = extractPaymentReference(hay) || extractPaymentReference(tx.reference)
  if (ref) {
    const byRef = open.filter(
      (c) =>
        (c.payment_reference || '').toUpperCase() === ref &&
        amountsEqual(c.amount, tx.amount)
    )
    if (byRef.length === 1) {
      return {
        kind: 'auto',
        chargeId: byRef[0].id,
        confidence: 'A',
        reason: `payment_reference:${ref}`,
      }
    }
    if (byRef.length > 1) {
      return { kind: 'none', reason: 'ambiguous_reference' }
    }
  }

  const byAmount = open.filter((c) => amountsEqual(c.amount, tx.amount))
  const byIdentity = byAmount.filter(
    (c) =>
      textHasApartment(hay, c.apartment_number) ||
      textHasName(hay, c.resident_name)
  )
  if (byIdentity.length === 1) {
    return {
      kind: 'auto',
      chargeId: byIdentity[0].id,
      confidence: 'B',
      reason: 'amount+identity_unique',
    }
  }
  if (byIdentity.length > 1) {
    return { kind: 'none', reason: 'ambiguous_identity' }
  }

  // Amount-only → suggested for manual queue if unique, never auto
  if (byAmount.length === 1) {
    return {
      kind: 'suggested',
      chargeId: byAmount[0].id,
      confidence: 'C',
      reason: 'amount_only',
    }
  }

  return { kind: 'none', reason: byAmount.length === 0 ? 'no_amount_match' : 'ambiguous_amount' }
}
