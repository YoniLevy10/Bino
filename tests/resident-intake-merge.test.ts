import { describe, expect, it } from 'vitest'
import { mergeResidentIntakeFields } from '@/lib/resident-intake'

describe('mergeResidentIntakeFields', () => {
  const incoming = {
    full_name: 'ישראל ישראלי',
    phone: '+972501111111',
    normalized_phone: '972501111111',
    email: 'new@example.com',
    apartment_number: '12',
    is_renter: true,
  }

  it('fills missing email/apartment without overwriting existing name', () => {
    const { patch, changed } = mergeResidentIntakeFields(
      {
        full_name: 'שם קיים',
        phone: '+972501111111',
        normalized_phone: '972501111111',
        email: null,
        apartment_number: null,
        is_renter: false,
        project_id: 'proj-a',
        deleted_at: null,
      },
      incoming,
      'proj-a'
    )

    expect(changed).toBe(true)
    expect(patch.full_name).toBe('שם קיים')
    expect(patch.email).toBe('new@example.com')
    expect(patch.apartment_number).toBe('12')
    expect(patch.is_renter).toBe(true)
    expect(patch.project_id).toBe('proj-a')
  })

  it('does not blank an existing email when intake omits email', () => {
    const { patch } = mergeResidentIntakeFields(
      {
        full_name: 'שם קיים',
        phone: '+972501111111',
        normalized_phone: '972501111111',
        email: 'keep@example.com',
        apartment_number: '5',
        is_renter: false,
        project_id: 'proj-a',
        deleted_at: null,
      },
      { ...incoming, email: null, apartment_number: '99', full_name: 'שם אחר' },
      'proj-a'
    )

    expect(patch.email).toBe('keep@example.com')
    expect(patch.apartment_number).toBe('5')
    expect(patch.full_name).toBe('שם קיים')
  })

  it('replaces WhatsApp placeholder name and moves stub into intake building', () => {
    const { patch } = mergeResidentIntakeFields(
      {
        full_name: 'דייר WhatsApp',
        phone: '+972501111111',
        normalized_phone: '972501111111',
        email: null,
        apartment_number: null,
        is_renter: false,
        project_id: 'proj-old',
        deleted_at: null,
      },
      incoming,
      'proj-new'
    )

    expect(patch.full_name).toBe('ישראל ישראלי')
    expect(patch.project_id).toBe('proj-new')
    expect(patch.apartment_number).toBe('12')
  })

  it('revives soft-deleted card into the intake building', () => {
    const { patch, changed } = mergeResidentIntakeFields(
      {
        full_name: 'שם ישן',
        phone: '+972501111111',
        normalized_phone: '972501111111',
        email: null,
        apartment_number: '3',
        is_renter: false,
        project_id: 'proj-old',
        deleted_at: '2026-01-01T00:00:00.000Z',
      },
      incoming,
      'proj-new'
    )

    expect(changed).toBe(true)
    expect(patch.deleted_at).toBeNull()
    expect(patch.project_id).toBe('proj-new')
    expect(patch.full_name).toBe('שם ישן')
    expect(patch.email).toBe('new@example.com')
  })

  it('keeps a real resident in their current building when phone already exists elsewhere', () => {
    const { patch } = mergeResidentIntakeFields(
      {
        full_name: 'דייר קיים',
        phone: '+972501111111',
        normalized_phone: '972501111111',
        email: null,
        apartment_number: '1',
        is_renter: false,
        project_id: 'proj-home',
        deleted_at: null,
      },
      incoming,
      'proj-other'
    )

    expect(patch.project_id).toBe('proj-home')
    expect(patch.email).toBe('new@example.com')
    expect(patch.full_name).toBe('דייר קיים')
  })
})
