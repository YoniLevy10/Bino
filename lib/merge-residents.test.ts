import { describe, expect, it } from 'vitest'
import { WHATSAPP_PLACEHOLDER_RESIDENT_NAME } from '@/lib/residents-whatsapp'
import { pickResidentToKeep, residentsLookLikeSamePerson } from '@/lib/merge-residents'

const base = {
  project_id: 'p1',
  client_id: 'c1',
  phone: '+16503958723',
  normalized_phone: '16503958723',
  email: null,
  apartment_number: null,
  notes: null,
  is_renter: false,
}

describe('residentsLookLikeSamePerson', () => {
  it('matches same normalized phone', () => {
    expect(
      residentsLookLikeSamePerson(
        { ...base, id: '1', full_name: 'מקסים קיי' },
        { ...base, id: '2', full_name: 'דייר WhatsApp', phone: '16503958723' }
      )
    ).toBe(true)
  })

  it('matches same name in same project', () => {
    expect(
      residentsLookLikeSamePerson(
        { ...base, id: '1', full_name: 'מקסים קיי', phone: null, normalized_phone: null },
        { ...base, id: '2', full_name: 'מקסים קיי', phone: null, normalized_phone: null }
      )
    ).toBe(true)
  })
})

describe('pickResidentToKeep', () => {
  it('prefers real name over WhatsApp placeholder', () => {
    const { keepId, mergeId } = pickResidentToKeep(
      { ...base, id: 'stub', full_name: WHATSAPP_PLACEHOLDER_RESIDENT_NAME, email: null },
      { ...base, id: 'real', full_name: 'מקסים קיי', email: 'maximkr@yahoo.com' }
    )
    expect(keepId).toBe('real')
    expect(mergeId).toBe('stub')
  })
})
