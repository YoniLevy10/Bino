import { describe, expect, it } from 'vitest'

// Mirror overdue derivation used in lib/resident-portal/charges.ts
function isOverdue(row: { status: string; due_date: string | null }, todayStr: string): boolean {
  if (row.status === 'paid' || row.status === 'cancelled' || row.status === 'draft') return false
  if (!row.due_date) return false
  return row.due_date < todayStr
}

describe('resident charge overdue derivation', () => {
  it('marks sent charge past due_date as overdue', () => {
    expect(isOverdue({ status: 'sent', due_date: '2026-09-01' }, '2026-09-30')).toBe(true)
  })
  it('does not mark paid as overdue', () => {
    expect(isOverdue({ status: 'paid', due_date: '2026-09-01' }, '2026-09-30')).toBe(false)
  })
  it('does not mark without due_date', () => {
    expect(isOverdue({ status: 'sent', due_date: null }, '2026-09-30')).toBe(false)
  })
})
