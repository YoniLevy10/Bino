import { describe, expect, it } from 'vitest'
import { buildResidentsDirectoryFilter } from '@/lib/hooks/use-residents-list'

describe('buildResidentsDirectoryFilter', () => {
  it('returns null for an empty search', () => {
    expect(buildResidentsDirectoryFilter('')).toBeNull()
    expect(buildResidentsDirectoryFilter('   ')).toBeNull()
  })

  it('matches a name and the normalized phone', () => {
    const filter = buildResidentsDirectoryFilter('0501234567')
    expect(filter).toContain('full_name.ilike.%0501234567%')
    expect(filter).toContain('normalized_phone.eq.972501234567')
  })
})
