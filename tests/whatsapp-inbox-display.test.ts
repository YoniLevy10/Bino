import { describe, expect, it } from 'vitest'
import {
  formatWhatsAppInboxDisplayLabel,
  isDisplayableResidentName,
  pickInboxResidentByPhone,
} from '@/lib/whatsapp-inbox-display'

describe('whatsapp inbox display', () => {
  it('shows resident name when saved', () => {
    expect(formatWhatsAppInboxDisplayLabel('972548102688', { full_name: 'יוני שולמן', apartment_number: '12' })).toBe(
      'יוני שולמן · דירה 12'
    )
  })

  it('falls back to phone when resident missing', () => {
    expect(formatWhatsAppInboxDisplayLabel('972548102688', null)).toBe('972548102688')
  })

  it('falls back to phone for WhatsApp placeholder name', () => {
    expect(formatWhatsAppInboxDisplayLabel('972548102688', { full_name: 'דייר WhatsApp' })).toBe('972548102688')
  })

  it('picks named resident by normalized phone', () => {
    const picked = pickInboxResidentByPhone(
      [
        { id: '1', full_name: 'דייר WhatsApp', normalized_phone: '972548102688' },
        { id: '2', full_name: 'יוני שולמן', normalized_phone: '972548102688', apartment_number: '3' },
      ],
      '0548102688'
    )
    expect(picked?.full_name).toBe('יוני שולמן')
  })

  it('rejects placeholder-only match', () => {
    expect(
      pickInboxResidentByPhone(
        [{ id: '1', full_name: 'דייר WhatsApp', normalized_phone: '972548102688' }],
        '972548102688'
      )
    ).toBeNull()
  })

  it('isDisplayableResidentName', () => {
    expect(isDisplayableResidentName('שרה')).toBe(true)
    expect(isDisplayableResidentName('דייר WhatsApp')).toBe(false)
  })
})
