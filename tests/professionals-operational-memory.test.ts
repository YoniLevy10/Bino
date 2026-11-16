import { describe, expect, it } from 'vitest'
import { compareProfessionalsByOperationalMemory } from '@/lib/hooks/use-professionals-list'
import { formatProfessionalPickerLabel } from '@/app/components/professionals/ProfessionalRatingStars'

describe('compareProfessionalsByOperationalMemory', () => {
  it('ranks higher personal_rating first', () => {
    const a = { full_name: 'א', personal_rating: 5, use_count: 0 }
    const b = { full_name: 'ב', personal_rating: 3, use_count: 99 }
    expect(compareProfessionalsByOperationalMemory(a, b)).toBeLessThan(0)
  })

  it('uses use_count when ratings equal', () => {
    const a = { full_name: 'א', personal_rating: 4, use_count: 2 }
    const b = { full_name: 'ב', personal_rating: 4, use_count: 10 }
    expect(compareProfessionalsByOperationalMemory(a, b)).toBeGreaterThan(0)
  })

  it('falls back to name', () => {
    const a = { full_name: 'אברהם', personal_rating: null, use_count: 0 }
    const b = { full_name: 'בני', personal_rating: null, use_count: 0 }
    expect(compareProfessionalsByOperationalMemory(a, b)).toBeLessThan(0)
  })
})

describe('formatProfessionalPickerLabel', () => {
  it('includes stars when rated', () => {
    expect(
      formatProfessionalPickerLabel({
        full_name: 'יוסי',
        trade: 'אינסטלציה',
        personal_rating: 3,
        phone: '0500000000',
      })
    ).toContain('★★★')
  })
})
