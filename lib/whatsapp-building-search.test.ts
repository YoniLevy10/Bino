import { describe, it, expect } from 'vitest'
import {
  normalizeBuildingSearchText,
  tokenizeBuildingSearch,
  rankProjectsByBuildingSearch,
} from './whatsapp-building-search'
import type { ProjectRow } from './whatsapp-interactive'

const sampleProjects: ProjectRow[] = [
  {
    id: '1',
    name: 'אלרואי 5',
    project_code: 'BMK101',
    address: 'רחוב אלרואי 5, תל אביב',
  },
  {
    id: '2',
    name: 'אלרואי 5 ג',
    project_code: 'BMK102',
    address: 'רחוב אלרואי 5 כניסה ג',
  },
  {
    id: '3',
    name: 'הרצל 12',
    project_code: 'BMK103',
    address: 'הרצל 12',
  },
]

describe('tokenizeBuildingSearch', () => {
  it('strips lone entrance letter but keeps street tokens', () => {
    expect(tokenizeBuildingSearch('אלרואי 5 ג')).toEqual(['אלרואי', '5'])
  })

  it('normalizes street words', () => {
    expect(tokenizeBuildingSearch('רחוב אלרואי 5')).toEqual(['אלרואי', '5'])
  })
})

describe('rankProjectsByBuildingSearch', () => {
  it('finds אלרואי 5 from partial address', () => {
    const results = rankProjectsByBuildingSearch(sampleProjects, 'אלרואי 5')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((p) => p.name.includes('אלרואי'))).toBe(true)
  })

  it('refine with entrance suffix still matches אלרואי buildings', () => {
    const broad = rankProjectsByBuildingSearch(sampleProjects, 'אלרואי 5')
    expect(broad.length).toBeGreaterThan(1)

    const refined = rankProjectsByBuildingSearch(broad, 'אלרואי 5 ג')
    expect(refined.length).toBeGreaterThan(0)
    expect(refined[0]?.name).toContain('אלרואי')
  })

  it('prefers exact entrance match when present in project name', () => {
    const results = rankProjectsByBuildingSearch(sampleProjects, 'אלרואי 5 ג')
    expect(results[0]?.id).toBe('2')
  })
})

describe('normalizeBuildingSearchText', () => {
  it('lowercases and collapses spaces', () => {
    expect(normalizeBuildingSearchText('  Alroey   5  ')).toBe('alroey 5')
  })
})
