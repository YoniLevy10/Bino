import { describe, expect, it } from 'vitest'
import {
  computeMajorityProgress,
  countVoteChoices,
  isApproveVote,
  normalizeVoteChoice,
} from '@/lib/building-governance/roles'

describe('normalizeVoteChoice / isApproveVote', () => {
  it('treats null/undefined/unknown as approve (backward compat)', () => {
    expect(normalizeVoteChoice(null)).toBe('approve')
    expect(normalizeVoteChoice(undefined)).toBe('approve')
    expect(normalizeVoteChoice('')).toBe('approve')
    expect(normalizeVoteChoice('weird')).toBe('approve')
    expect(isApproveVote(null)).toBe(true)
  })

  it('preserves oppose and abstain', () => {
    expect(normalizeVoteChoice('oppose')).toBe('oppose')
    expect(normalizeVoteChoice('abstain')).toBe('abstain')
    expect(isApproveVote('oppose')).toBe(false)
    expect(isApproveVote('abstain')).toBe(false)
    expect(isApproveVote('approve')).toBe(true)
  })
})

describe('countVoteChoices', () => {
  it('counts only signed rows; null vote_choice = approve', () => {
    expect(
      countVoteChoices([
        { status: 'signed', vote_choice: null },
        { status: 'signed', vote_choice: 'approve' },
        { status: 'signed', vote_choice: 'oppose' },
        { status: 'signed', vote_choice: 'abstain' },
        { status: 'pending', vote_choice: null },
      ])
    ).toEqual({ approve: 2, oppose: 1, abstain: 1, signed: 4 })
  })
})

describe('computeMajorityProgress approve-only', () => {
  it('uses approveCount against threshold need', () => {
    // required=4, θ=0.5 → need=2
    const progress = computeMajorityProgress({
      approveCount: 2,
      requiredSignatures: 4,
      majorityThreshold: 0.5,
    })
    expect(progress.need).toBe(2)
    expect(progress.reached).toBe(true)
    expect(progress.pct).toBe(100)
  })

  it('oppose-heavy tallies do not reach majority via signedCount alias alone when approveCount set', () => {
    const progress = computeMajorityProgress({
      approveCount: 1,
      signedCount: 5,
      requiredSignatures: 4,
      majorityThreshold: 0.5,
    })
    expect(progress.approveCount).toBe(1)
    expect(progress.reached).toBe(false)
  })

  it('falls back to signedCount when approveCount omitted (legacy callers)', () => {
    const progress = computeMajorityProgress({
      signedCount: 2,
      requiredSignatures: 3,
      majorityThreshold: 0.5,
    })
    expect(progress.need).toBe(2)
    expect(progress.reached).toBe(true)
  })
})
