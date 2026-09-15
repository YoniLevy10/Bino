import { describe, expect, it } from 'vitest'
import { DISCOVERY_QUERY_EXPLORE_RATIO } from '@/lib/sales-leads/config'
import type { PlacesSearchJob } from '@/lib/sales-leads/discovery-mapping'
import {
  computeYieldScore,
  selectJobsForBudget,
  type QueryStatRow,
} from '@/lib/sales-leads/query-queue'

const area = {
  labelHe: 'תל אביב מרכז',
  lat: 32.08,
  lng: 34.78,
  radiusMeters: 8000,
}

function job(queryKey: string, textQuery = queryKey): PlacesSearchJob {
  return {
    textQuery,
    area,
    queryKey,
    segmentSlug: 'building_mgmt',
    languageCode: 'he',
    outreachAngleHe: 'בדיקה',
  }
}

function seenStat(queryKey: string, yieldScore: number): QueryStatRow {
  return {
    query_key: queryKey,
    yield_score: yieldScore,
    raw_count: 10,
    last_run_at: '2026-01-01T00:00:00Z',
  }
}

describe('computeYieldScore', () => {
  it('returns 0 when raw is empty', () => {
    expect(computeYieldScore({ raw: 0, uniqueNew: 4, suitable: 3, needsReview: 2 })).toBe(0)
  })

  it('weights suitable / needs_review / unique_new against raw', () => {
    // useful = 3*1 + 2*0.45 + 4*0.25 = 3 + 0.9 + 1 = 4.9; 4.9/10 = 0.49
    expect(computeYieldScore({ raw: 10, uniqueNew: 4, suitable: 3, needsReview: 2 })).toBe(0.49)
  })
})

describe('selectJobsForBudget', () => {
  it('returns empty when budget is 0 or jobs are empty', () => {
    expect(selectJobsForBudget([job('a')], [], 0)).toEqual([])
    expect(selectJobsForBudget([], [seenStat('a', 1)], 5)).toEqual([])
  })

  it('respects the api call budget cap', () => {
    const jobs = Array.from({ length: 12 }, (_, i) => job(`q${i}`))
    const selected = selectJobsForBudget(jobs, [], 3)
    expect(selected).toHaveLength(3)
  })

  it('exploits high-yield seen queries and explores unseen ones', () => {
    const jobs = [
      job('seen-high'),
      job('seen-low'),
      job('unseen-a'),
      job('unseen-b'),
      job('unseen-c'),
    ]
    const stats = [seenStat('seen-high', 0.9), seenStat('seen-low', 0.05)]
    const budget = 5
    const selected = selectJobsForBudget(jobs, stats, budget)
    expect(selected).toHaveLength(budget)

    const exploreSlots = Math.max(1, Math.floor(budget * DISCOVERY_QUERY_EXPLORE_RATIO))
    const exploitSlots = Math.max(0, budget - exploreSlots)
    expect(exploreSlots).toBe(1)
    expect(exploitSlots).toBe(4)

    const keys = selected.map((j) => j.queryKey)
    // Highest-yield seen job is taken first for exploit slots
    expect(keys[0]).toBe('seen-high')
    // Unseen jobs fill remaining slots (explore + leftover exploit capacity)
    expect(keys).toContain('unseen-a')
    expect(keys.filter((k) => k.startsWith('unseen')).length).toBeGreaterThanOrEqual(1)
  })

  it('with budget 1 only takes an explore/unseen slot first', () => {
    const jobs = [job('seen-high'), job('unseen-a'), job('unseen-b')]
    const stats = [seenStat('seen-high', 0.95)]
    const selected = selectJobsForBudget(jobs, stats, 1)
    expect(selected).toHaveLength(1)
    // exploitSlots = 0, so first fill is from explore list
    expect(selected[0].queryKey).toBe('unseen-a')
  })

  it('ranks exploit candidates by yield_score descending', () => {
    const jobs = [job('mid'), job('low'), job('high'), job('unseen')]
    const stats = [
      seenStat('mid', 0.4),
      seenStat('low', 0.1),
      seenStat('high', 0.8),
    ]
    // budget 4 → exploreSlots=0.8→1, exploitSlots=3 → take top 3 seen by yield then unseen
    const selected = selectJobsForBudget(jobs, stats, 4)
    expect(selected.map((j) => j.queryKey).slice(0, 3)).toEqual(['high', 'mid', 'low'])
    expect(selected[3].queryKey).toBe('unseen')
  })

  it('can refill low-yield seen jobs into explore capacity when unseen runs out', () => {
    const jobs = [job('seen-high'), job('seen-low-a'), job('seen-low-b')]
    const stats = [
      seenStat('seen-high', 0.9),
      seenStat('seen-low-a', 0.05),
      seenStat('seen-low-b', 0.02),
    ]
    // All seen → explore list empty; lowYieldSeen appended into explore take
    const selected = selectJobsForBudget(jobs, stats, 3)
    expect(selected).toHaveLength(3)
    expect(selected.map((j) => j.queryKey)).toContain('seen-high')
  })
})
