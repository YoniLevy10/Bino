import { describe, expect, it } from 'vitest'
import { countPendingResidentApprovals } from '@/lib/building-governance/pending-approvals'

describe('countPendingResidentApprovals', () => {
  it('counts only pending stubs on open decisions', () => {
    expect(
      countPendingResidentApprovals([
        { status: 'pending', decision_status: 'open' },
        { status: 'pending', decision_status: 'open' },
        { status: 'signed', decision_status: 'open' },
        { status: 'pending', decision_status: 'passed' },
        { status: 'pending', decision_status: null },
      ])
    ).toBe(2)
  })

  it('returns 0 for empty input', () => {
    expect(countPendingResidentApprovals([])).toBe(0)
  })
})
