import { describe, expect, it } from 'vitest'
import { residentAuthEmailFromPhone } from '@/lib/resident-portal/phone-otp'
import { normalizePhone } from '@/lib/residents-whatsapp'

describe('resident phone otp helpers', () => {
  it('normalizes Israeli mobiles consistently', () => {
    expect(normalizePhone('050-1234567')).toBe('972501234567')
    expect(normalizePhone('+972501234567')).toBe('972501234567')
  })

  it('builds stable synthetic auth email from phone', () => {
    expect(residentAuthEmailFromPhone('972501234567')).toBe('r972501234567@residents.bino.local')
  })
})
