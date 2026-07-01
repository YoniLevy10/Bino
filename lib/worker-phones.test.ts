import { describe, expect, it } from 'vitest'
import {
  collectWorkerPhones,
  formatWorkerPhoneDisplay,
  isValidWorkerPhone,
  normalizeWorkerPhone,
  parseWorkerPhone,
  sanitizeExtraPhones,
} from '@/lib/worker-phones'

describe('normalizeWorkerPhone', () => {
  it('accepts 05x with dashes', () => {
    expect(normalizeWorkerPhone('050-123-4567')).toBe('972501234567')
    expect(normalizeWorkerPhone('0501234567')).toBe('972501234567')
  })

  it('accepts +972 and 972 prefixes', () => {
    expect(normalizeWorkerPhone('+972-50-123-4567')).toBe('972501234567')
    expect(normalizeWorkerPhone('972501234567')).toBe('972501234567')
  })

  it('accepts spaces', () => {
    expect(normalizeWorkerPhone('050 123 4567')).toBe('972501234567')
  })

  it('accepts unicode dashes and parentheses (common on iOS)', () => {
    expect(normalizeWorkerPhone('+972\u201354-561-9243')).toBe('972545619243')
    expect(normalizeWorkerPhone('(972) 54-561-9243')).toBe('972545619243')
    expect(normalizeWorkerPhone('+972 (54) 561-9243')).toBe('972545619243')
    expect(normalizeWorkerPhone('+972 54-561-9243')).toBe('972545619243')
  })

  it('rejects too short numbers', () => {
    expect(normalizeWorkerPhone('050-123')).toBe('')
    expect(isValidWorkerPhone('050-123')).toBe(false)
  })
})

describe('formatWorkerPhoneDisplay', () => {
  it('formats normalized storage to local dashed form', () => {
    expect(formatWorkerPhoneDisplay('972501234567')).toBe('050-123-4567')
    expect(formatWorkerPhoneDisplay('050-123-4567')).toBe('050-123-4567')
  })
})

describe('sanitizeExtraPhones', () => {
  it('normalizes and dedupes extras against primary', () => {
    const result = sanitizeExtraPhones('050-111-2222', ['050-333-4444', '+972-50-333-4444'])
    expect(result).toEqual({ ok: true, phones: ['972503334444'] })
  })

  it('rejects invalid extra', () => {
    const result = sanitizeExtraPhones('050-111-2222', ['123'])
    expect(result.ok).toBe(false)
  })
})

describe('parseWorkerPhone', () => {
  it('returns normalized phone on success', () => {
    expect(parseWorkerPhone('050-123-4567')).toEqual({ ok: true, normalized: '972501234567' })
  })

  it('returns Hebrew error for invalid input', () => {
    const result = parseWorkerPhone('123', 'מספר טלפון ראשי')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('לא תקין')
  })
})

describe('collectWorkerPhones', () => {
  it('returns normalized distinct phones', () => {
    expect(
      collectWorkerPhones({
        phone: '050-111-2222',
        extra_phones: ['050-333-4444', '972503334444'],
      })
    ).toEqual(['972501112222', '972503334444'])
  })
})
