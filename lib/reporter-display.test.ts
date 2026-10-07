import { describe, expect, it } from 'vitest'
import {
  formatReporterNameAndPhone,
  formatReporterPhoneForDisplay,
  normalizeReporterPhone,
  savedResidentDisplayName,
} from '@/lib/reporter-display'

describe('formatReporterNameAndPhone', () => {
  it('joins a saved name with the local phone', () => {
    expect(formatReporterNameAndPhone('יוני לוי', '972501234567')).toBe('יוני לוי 0501234567')
  })

  it('returns only the phone when the resident is not saved', () => {
    expect(formatReporterNameAndPhone(null, '972501234567')).toBe('0501234567')
    expect(formatReporterNameAndPhone('דייר WhatsApp', '0548102688')).toBe('0548102688')
    expect(formatReporterNameAndPhone('  ', '0501112233')).toBe('0501112233')
  })

  it('returns the name alone when there is no phone', () => {
    expect(formatReporterNameAndPhone('יוני לוי', null)).toBe('יוני לוי')
  })
})

describe('savedResidentDisplayName', () => {
  it('rejects the WhatsApp placeholder', () => {
    expect(savedResidentDisplayName('דייר WhatsApp')).toBeNull()
    expect(savedResidentDisplayName('דנה כהן')).toBe('דנה כהן')
  })
})

describe('normalizeReporterPhone', () => {
  it('matches resident normalized_phone keys', () => {
    expect(normalizeReporterPhone('054-810-2688')).toBe('972548102688')
    expect(normalizeReporterPhone('972548102688')).toBe('972548102688')
  })
})

describe('formatReporterPhoneForDisplay', () => {
  it('labels hashed test keys', () => {
    expect(formatReporterPhoneForDisplay('wa_test_abc')).toBe('(מספר בדיקות)')
  })
})
