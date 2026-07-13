import { describe, it, expect } from 'vitest'
import {
  buildBuildingSearchQueries,
  extractAddressTail,
  extractInlineAddressPhrases,
  messageContainsBuildingHint,
  normalizeAttachedEntrance,
} from './whatsapp-address-extract'
import { isNearTokenMatch, rankProjectsByBuildingSearch } from './whatsapp-building-search'
import type { ProjectRow } from './whatsapp-interactive'

const alroeyProjects: ProjectRow[] = [
  {
    id: '1',
    name: 'אלרואי 5',
    project_code: 'BMK101',
    address: 'רחוב אלרואי 5, חדרה',
  },
  {
    id: '2',
    name: 'אלרואי 5 ג',
    project_code: 'BMK102',
    address: 'רחוב דוד אלרואי 5 כניסה ג, חדרה',
  },
]

const heletzProjects: ProjectRow[] = [
  {
    id: 'h12',
    name: 'חלץ 12',
    project_code: 'BMK201',
    address: 'חלץ 12',
    address_en: 'Heletz 12',
  },
  {
    id: 'hz12',
    name: 'הרצל 12',
    project_code: 'BMK202',
    address: 'הרצל 12',
    address_en: 'Herzl 12',
  },
  {
    id: 'w12',
    name: 'ויצמן 12',
    project_code: 'BMK203',
    address: 'ויצמן 12',
    address_en: 'Weizmann 12',
  },
]

describe('normalizeAttachedEntrance', () => {
  it('splits 5ג into 5 ג', () => {
    expect(normalizeAttachedEntrance('דוד אלרואי 5ג')).toBe('דוד אלרואי 5 ג')
  })
})

describe('extractAddressTail', () => {
  it('pulls address from problem + address message', () => {
    expect(extractAddressTail('נזילה בממטרה דוד אלרואי 5ג')).toBe('אלרואי 5 ג')
  })
})

describe('extractInlineAddressPhrases', () => {
  it('pulls mid-sentence English street + number', () => {
    const msg = 'Hi, the doors of the right lift in Helets 12 is making lots of noises'
    const phrases = extractInlineAddressPhrases(msg)
    expect(phrases.some((p) => /helets\s*12/i.test(p))).toBe(true)
  })
})

describe('buildBuildingSearchQueries — real resident messages', () => {
  it('generates variants for דוד אלרואי 5ג', () => {
    const queries = buildBuildingSearchQueries('דוד אלרואי 5ג')
    expect(queries.some((q) => q.includes('אלרואי') && q.includes('5'))).toBe(true)
  })

  it('strips thanks and street prefix from ברח׳ דוד אלרואי 5ג. תודה', () => {
    const queries = buildBuildingSearchQueries("ברח' דוד אלרואי 5ג. תודה")
    expect(queries.some((q) => q.includes('אלרואי') && /\b5\b/.test(q))).toBe(true)
  })

  it('handles name prefix and city suffix', () => {
    const queries = buildBuildingSearchQueries('ברוך היר אלרואי 5ג חדרה')
    expect(queries.some((q) => q.includes('אלרואי') && q.includes('5'))).toBe(true)
  })

  it('finds אלרואי 5 ג project from דוד אלרואי 5ג', () => {
    for (const q of buildBuildingSearchQueries('דוד אלרואי 5ג')) {
      const results = rankProjectsByBuildingSearch(alroeyProjects, q)
      if (results.length === 1 && results[0]?.id === '2') return
    }
    const combined = rankProjectsByBuildingSearch(alroeyProjects, 'דוד אלרואי 5 ג')
    expect(combined[0]?.id).toBe('2')
  })

  it('includes mid-sentence Helets 12 for English lift reports', () => {
    const msg = 'Hi, the doors of the right lift in Helets 12 is making lots of noises'
    const queries = buildBuildingSearchQueries(msg)
    expect(queries.some((q) => /helets\s*12/i.test(q))).toBe(true)
  })
})

describe('messageContainsBuildingHint', () => {
  it('detects embedded address in problem description', () => {
    expect(messageContainsBuildingHint('נזילה בממטרה דוד אלרואי 5ג')).toBe(true)
  })

  it('does not treat pure problem text as address', () => {
    expect(messageContainsBuildingHint('יש ממטרה שיוצאת משליטה')).toBe(false)
  })
})

describe('building search typo + ranking', () => {
  it('treats Helets ≈ Heletz', () => {
    expect(isNearTokenMatch('heletz 12', 'helets')).toBe(true)
  })

  it('resolves English lift report with typo to חלץ 12 only', () => {
    const msg = 'Hi, the doors of the right lift in Helets 12 is making lots of noises'
    const ranked = rankProjectsByBuildingSearch(heletzProjects, 'Helets 12')
    expect(ranked.map((p) => p.id)).toEqual(['h12'])

    // Full message via shorter inline query must not match every *12 building
    const fromFull = rankProjectsByBuildingSearch(heletzProjects, msg)
    expect(fromFull.map((p) => p.id)).toEqual(['h12'])
  })
})
