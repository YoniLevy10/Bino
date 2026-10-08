import { describe, expect, it } from 'vitest'
import {
  fixlyDirectoryOrFilter,
  notesFromFixlyPerson,
  sanitizeFixlyDirectoryQuery,
  tradeFromFixlyCategory,
} from '@/lib/fixly/pro-waitlist-directory'

describe('fixly pro_waitlist directory', () => {
  it('keeps Hebrew search text and drops filter metacharacters', () => {
    expect(sanitizeFixlyDirectoryQuery('  חשמלאי, ירושלים  ')).toBe('חשמלאי ירושלים')
    expect(sanitizeFixlyDirectoryQuery("%_'.()*")).toBe('')
    expect(sanitizeFixlyDirectoryQuery('א'.repeat(120)).length).toBe(80)
  })

  it('builds a bounded or-filter only when a query remains', () => {
    expect(fixlyDirectoryOrFilter('   ')).toBeNull()
    expect(fixlyDirectoryOrFilter('אינסטל')).toBe(
      'full_name.ilike.%אינסטל%,category.ilike.%אינסטל%,city.ilike.%אינסטל%,phone.ilike.%אינסטל%'
    )
  })

  it('maps category into the local trade field and keeps overflow in notes', () => {
    expect(tradeFromFixlyCategory('  חשמלאים  ')).toBe('חשמלאים')
    expect(tradeFromFixlyCategory('')).toBeNull()
    const long = 'א'.repeat(140)
    expect(tradeFromFixlyCategory(long)).toHaveLength(100)
    expect(notesFromFixlyPerson({ city: 'ירושלים', category: long })).toContain('מקור: מאגר Fixly')
    expect(notesFromFixlyPerson({ city: 'ירושלים', category: long })).toContain('ירושלים')
    expect(notesFromFixlyPerson({ city: 'ירושלים', category: 'חשמלאים' })).toBe(
      'מקור: מאגר Fixly · ירושלים'
    )
  })
})
