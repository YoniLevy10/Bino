import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  computeEligibleVoterCount,
  countResidentBoundSignedVotes,
} from '@/lib/building-governance/eligible-voters'
import { computeMajorityProgress } from '@/lib/building-governance/roles'
import { hashSignatureContent } from '@/lib/building-governance/signature-content'

describe('computeEligibleVoterCount', () => {
  it('counts one vote per unit with a mapped resident', () => {
    const n = computeEligibleVoterCount(
      ['u1', 'u2', 'u3'],
      [
        { unit_id: 'u1' },
        { unit_id: 'u1' }, // same unit — still one
        { unit_id: 'u2', is_renter: true },
        { unit_id: 'u9' }, // not in project units
        { unit_id: null },
        { unit_id: 'u3', deleted_at: '2026-01-01T00:00:00Z' },
      ]
    )
    expect(n).toBe(2)
  })

  it('returns 0 when no units or no mapped residents', () => {
    expect(computeEligibleVoterCount([], [{ unit_id: 'u1' }])).toBe(0)
    expect(computeEligibleVoterCount(['u1'], [])).toBe(0)
  })
})

describe('countResidentBoundSignedVotes', () => {
  it('ignores stubs without resident_id', () => {
    const n = countResidentBoundSignedVotes([
      { status: 'signed', resident_id: null, unit_id: null },
      { status: 'signed', resident_id: 'r1', unit_id: 'u1' },
      { status: 'pending', resident_id: 'r2', unit_id: 'u2' },
    ])
    expect(n).toBe(1)
  })

  it('dedupes by unit_id when present', () => {
    const n = countResidentBoundSignedVotes([
      { status: 'signed', resident_id: 'r1', unit_id: 'u1' },
      { status: 'signed', resident_id: 'r2', unit_id: 'u1' },
      { status: 'signed', resident_id: 'r3', unit_id: 'u2' },
    ])
    expect(n).toBe(2)
  })

  it('falls back to resident_id when unit_id missing', () => {
    const n = countResidentBoundSignedVotes([
      { status: 'signed', resident_id: 'r1', unit_id: null },
      { status: 'signed', resident_id: 'r1', unit_id: null },
      { status: 'signed', resident_id: 'r2', unit_id: null },
    ])
    expect(n).toBe(2)
  })
})

describe('computeMajorityProgress', () => {
  it('requires ceil(required * threshold) signatures', () => {
    // eligible 10, 50% → need 5
    expect(
      computeMajorityProgress({
        signedCount: 4,
        requiredSignatures: 10,
        majorityThreshold: 0.5,
      })
    ).toEqual({ pct: 80, reached: false, need: 5, approveCount: 4 })

    expect(
      computeMajorityProgress({
        signedCount: 5,
        requiredSignatures: 10,
        majorityThreshold: 0.5,
      })
    ).toEqual({ pct: 100, reached: true, need: 5, approveCount: 5 })
  })

  it('supports special majority thresholds from UI (no hardcode 0.5)', () => {
    // 4 eligible, 75% → need 3
    const p = computeMajorityProgress({
      signedCount: 2,
      requiredSignatures: 4,
      majorityThreshold: 0.75,
    })
    expect(p.need).toBe(3)
    expect(p.reached).toBe(false)
    expect(p.pct).toBe(67)
  })

  it('treats required=2 threshold=0.5 as need=1 (historical edge)', () => {
    const p = computeMajorityProgress({
      signedCount: 1,
      requiredSignatures: 2,
      majorityThreshold: 0.5,
    })
    expect(p.need).toBe(1)
    expect(p.reached).toBe(true)
  })
})

describe('hashSignatureContent', () => {
  it('returns stable sha256 hex of data-URL', () => {
    const dataUrl = 'data:image/png;base64,abc'
    expect(hashSignatureContent(dataUrl)).toBe(
      createHash('sha256').update(dataUrl, 'utf8').digest('hex')
    )
    expect(hashSignatureContent(dataUrl)).toHaveLength(64)
  })
})
