import { describe, expect, it } from 'vitest'
import { normalizePhone019, resolve019SmsSource, is019UnverifiedSourceError } from '@/lib/sms-019-core'
import {
  buildResidentPortalOtpSms,
  residentAuthEmailFromPhone,
} from '@/lib/resident-portal/phone-otp'
import { normalizePhone } from '@/lib/residents-whatsapp'

describe('resident phone otp helpers', () => {
  it('normalizes Israeli mobiles consistently', () => {
    expect(normalizePhone('050-1234567')).toBe('972501234567')
    expect(normalizePhone('+972501234567')).toBe('972501234567')
  })

  it('builds stable synthetic auth email from phone', () => {
    expect(residentAuthEmailFromPhone('972501234567')).toBe('r972501234567@residents.bino.local')
  })

  it('builds Apple domain-bound OTP SMS with code on the last line', () => {
    const body = buildResidentPortalOtpSms({
      company: 'Bamakor',
      code: '830191',
      host: 'bino.casa',
    })
    expect(body).toContain('Bamakor: הסיסמה לכניסה לאזור האישי היא 830191.')
    expect(body.trimEnd().endsWith('@bino.casa #830191')).toBe(true)
    const lines = body.split('\n')
    expect(lines[lines.length - 1]).toBe('@bino.casa #830191')
  })
})

describe('resolve019SmsSource', () => {
  it('keeps valid client sender phones', () => {
    expect(resolve019SmsSource('052-6026437')).toBe('972526026437')
    expect(resolve019SmsSource('972526026437')).toBe('972526026437')
  })

  it('rejects alphanumeric brand names and falls back to platform sender', () => {
    const source = resolve019SmsSource('מוקד במקור')
    expect(normalizePhone019(source)).toBe(source)
    expect(source.startsWith('972')).toBe(true)
  })

  it('falls back when sender is empty', () => {
    const source = resolve019SmsSource(null)
    expect(source).toMatch(/^972\d{9}$/)
  })

  it('detects unverified-source provider errors', () => {
    expect(
      is019UnverifiedSourceError(
        '019SMS status 512: unverified source number - you can verify this number with verify_phone request'
      )
    ).toBe(true)
    expect(is019UnverifiedSourceError('019SMS status 515: Unverified source')).toBe(true)
    expect(is019UnverifiedSourceError('019SMS status 989: The message is too long')).toBe(false)
  })
})
