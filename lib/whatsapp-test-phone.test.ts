import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeWhatsAppPhoneDigits,
  whatsappDbPhoneKey,
  isWhatsAppTestSender,
  displayReporterForExternalMessage,
} from './whatsapp-test-phone'

describe('normalizeWhatsAppPhoneDigits', () => {
  it('strips non-digits from Israeli formats', () => {
    expect(normalizeWhatsAppPhoneDigits('+972-50-123-4567')).toBe('972501234567')
    expect(normalizeWhatsAppPhoneDigits('050-123-4567')).toBe('0501234567')
    expect(normalizeWhatsAppPhoneDigits('972501234567')).toBe('972501234567')
  })

  it('returns empty for blank input', () => {
    expect(normalizeWhatsAppPhoneDigits('')).toBe('')
    expect(normalizeWhatsAppPhoneDigits('   ')).toBe('')
  })
})

describe('whatsappDbPhoneKey', () => {
  const prev = process.env.WHATSAPP_TEST_PHONE_NUMBERS

  afterEach(() => {
    if (prev === undefined) delete process.env.WHATSAPP_TEST_PHONE_NUMBERS
    else process.env.WHATSAPP_TEST_PHONE_NUMBERS = prev
  })

  it('returns raw from for real WhatsApp numbers', () => {
    process.env.WHATSAPP_TEST_PHONE_NUMBERS = ''
    expect(whatsappDbPhoneKey('972501234567')).toBe('972501234567')
  })

  it('hashes test numbers to wa_test_ prefix', () => {
    process.env.WHATSAPP_TEST_PHONE_NUMBERS = '972509999999'
    expect(whatsappDbPhoneKey('972509999999')).toMatch(/^wa_test_[a-f0-9]{24}$/)
    expect(whatsappDbPhoneKey('972509999999')).toBe(whatsappDbPhoneKey('+972-50-999-9999'))
  })
})

describe('isWhatsAppTestSender / displayReporterForExternalMessage', () => {
  const prev = process.env.WHATSAPP_TEST_PHONE_NUMBERS

  afterEach(() => {
    if (prev === undefined) delete process.env.WHATSAPP_TEST_PHONE_NUMBERS
    else process.env.WHATSAPP_TEST_PHONE_NUMBERS = prev
  })

  it('detects configured test numbers', () => {
    process.env.WHATSAPP_TEST_PHONE_NUMBERS = '972501112222'
    expect(isWhatsAppTestSender('972501112222')).toBe(true)
    expect(isWhatsAppTestSender('972501234567')).toBe(false)
  })

  it('masks test numbers in external display', () => {
    process.env.WHATSAPP_TEST_PHONE_NUMBERS = '972501112222'
    expect(displayReporterForExternalMessage('972501112222')).toBe('(מספר בדיקות)')
    expect(displayReporterForExternalMessage('972501234567')).toBe('972501234567')
  })
})
