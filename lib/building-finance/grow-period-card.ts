/**
 * Read-only Grow/collections period card helpers for building reports.
 * Collected uses paid_at (fallback documented); billed/outstanding use created_at.
 */

import { roundMoney } from '@/lib/unit-ledger'

export type GrowChargePeriodInput = {
  status: string
  amount: number | string | null
  paid_at: string | null
  updated_at?: string | null
  created_at: string
}

export type GrowPeriodBounds = {
  /** Inclusive period start YYYY-MM-DD */
  startDate: string
  /** Inclusive period end YYYY-MM-DD */
  endDate: string
}

export type GrowPeriodCardTotals = {
  collected: number
  outstanding: number
  billed: number
  /** Hebrew semantics labels for UI */
  labels: {
    collected: string
    outstanding: string
    billed: string
  }
  /** Documented fallback chain for collected date */
  collected_date_basis: 'paid_at' | 'updated_at' | 'created_at' | 'mixed' | 'none'
}

export const GROW_PERIOD_LABELS = {
  collected: 'נגבה לפי תאריך תשלום',
  outstanding: 'פתוח לפי תאריך יצירה',
  billed: 'חויב לפי תאריך יצירה',
} as const

/** ISO / timestamptz → YYYY-MM-DD (UTC calendar day). */
export function chargeDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/**
 * Effective payment date for collected bucketing.
 * Prefer paid_at; if missing on a paid charge, fall back to updated_at then created_at.
 */
export function effectivePaidAt(
  row: Pick<GrowChargePeriodInput, 'paid_at' | 'updated_at' | 'created_at'>
): { iso: string; basis: 'paid_at' | 'updated_at' | 'created_at' } {
  if (row.paid_at) return { iso: row.paid_at, basis: 'paid_at' }
  if (row.updated_at) return { iso: row.updated_at, basis: 'updated_at' }
  return { iso: row.created_at, basis: 'created_at' }
}

export function isDateKeyInPeriod(
  dateKey: string | null,
  period: GrowPeriodBounds
): boolean {
  if (!dateKey) return false
  return dateKey >= period.startDate && dateKey <= period.endDate
}

function toAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? roundMoney(Math.max(0, n)) : 0
}

/**
 * Aggregate Grow charges into period card totals.
 * - collected: status=paid AND effective paid date in period
 * - billed / outstanding: created_at in period (create semantics); skip cancelled
 */
export function aggregateGrowPeriodCard(
  charges: GrowChargePeriodInput[],
  period: GrowPeriodBounds
): GrowPeriodCardTotals {
  let collected = 0
  let outstanding = 0
  let billed = 0
  const bases = new Set<'paid_at' | 'updated_at' | 'created_at'>()

  for (const row of charges) {
    if (row.status === 'cancelled') continue
    const amount = toAmount(row.amount)
    const createdKey = chargeDateKey(row.created_at)

    if (isDateKeyInPeriod(createdKey, period)) {
      billed = roundMoney(billed + amount)
      if (row.status === 'sent' || row.status === 'draft' || row.status === 'failed') {
        outstanding = roundMoney(outstanding + amount)
      }
    }

    if (row.status === 'paid') {
      const paid = effectivePaidAt(row)
      const paidKey = chargeDateKey(paid.iso)
      if (isDateKeyInPeriod(paidKey, period)) {
        collected = roundMoney(collected + amount)
        bases.add(paid.basis)
      }
    }
  }

  let collected_date_basis: GrowPeriodCardTotals['collected_date_basis'] = 'none'
  if (bases.size === 1) {
    collected_date_basis = [...bases][0]!
  } else if (bases.size > 1) {
    collected_date_basis = 'mixed'
  }

  return {
    collected,
    outstanding,
    billed,
    labels: { ...GROW_PERIOD_LABELS },
    collected_date_basis,
  }
}
