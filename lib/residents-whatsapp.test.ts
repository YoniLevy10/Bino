import { describe, expect, it } from 'vitest'
import { residentPromptGreetingPrefix, reporterDisplayNameForNotification } from '@/lib/residents-whatsapp'

describe('residentPromptGreetingPrefix', () => {
  it('uses first name for known residents', () => {
    expect(residentPromptGreetingPrefix('יוני לוי')).toBe('שלום יוני, ')
  })

  it('falls back to generic greeting for placeholder name', () => {
    expect(residentPromptGreetingPrefix('דייר WhatsApp')).toBe('שלום, ')
  })

  it('falls back to generic greeting when empty', () => {
    expect(residentPromptGreetingPrefix('')).toBe('שלום, ')
  })
})

describe('reporterDisplayNameForNotification', () => {
  it('shows resident name when known', () => {
    expect(reporterDisplayNameForNotification('972501234567', 'יוני לוי')).toBe('יוני לוי')
  })

  it('falls back to phone when name unknown', () => {
    expect(reporterDisplayNameForNotification('972501234567', null)).toBe('972501234567')
  })

  it('falls back to phone for placeholder WhatsApp resident', () => {
    expect(reporterDisplayNameForNotification('972501234567', 'דייר WhatsApp')).toBe('972501234567')
  })
})
