import { describe, expect, it } from 'vitest'
import { residentMatchesQuery } from '@/lib/collection-resident-search'

const base = {
  full_name: 'ישראל ישראלי',
  apartment_number: '12',
  phone: '054-810-2688',
  normalized_phone: '972548102688',
}

describe('residentMatchesQuery', () => {
  it('matches by name', () => {
    expect(residentMatchesQuery(base, 'ישראל')).toBe(true)
    expect(residentMatchesQuery(base, 'כהן')).toBe(false)
  })

  it('matches local and 972 phone forms', () => {
    expect(residentMatchesQuery(base, '0548102688')).toBe(true)
    expect(residentMatchesQuery(base, '548102688')).toBe(true)
    expect(residentMatchesQuery(base, '972548102688')).toBe(true)
    expect(residentMatchesQuery(base, '0500000000')).toBe(false)
  })

  it('matches apartment', () => {
    expect(residentMatchesQuery(base, '12')).toBe(true)
  })

  it('ignores empty query', () => {
    expect(residentMatchesQuery(base, '   ')).toBe(false)
  })
})
