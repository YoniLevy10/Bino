import { describe, expect, it } from 'vitest'
import {
  normalizeOwnershipType,
  parseOwnershipPercent,
  RESIDENT_OWNERSHIP_TYPES,
} from './resident-ownership'

describe('resident-ownership', () => {
  it('exposes Hebrew ownership types', () => {
    expect(RESIDENT_OWNERSHIP_TYPES).toContain('בעלים')
    expect(RESIDENT_OWNERSHIP_TYPES).toContain('שוכר')
  })

  it('parses ownership percent from numbers and strings', () => {
    expect(parseOwnershipPercent(50)).toBe(50)
    expect(parseOwnershipPercent('33.5')).toBe(33.5)
    expect(parseOwnershipPercent('100%')).toBe(100)
    expect(parseOwnershipPercent('12,5')).toBe(12.5)
    expect(parseOwnershipPercent('')).toBeNull()
    expect(parseOwnershipPercent('abc')).toBeNull()
    expect(parseOwnershipPercent(150)).toBeNull()
  })

  it('normalizes ownership type', () => {
    expect(normalizeOwnershipType('  בעלים  ')).toBe('בעלים')
    expect(normalizeOwnershipType('')).toBeNull()
    expect(normalizeOwnershipType(null)).toBeNull()
  })
})
