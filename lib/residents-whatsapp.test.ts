import { describe, expect, it } from 'vitest'
import { residentPromptGreetingPrefix } from '@/lib/residents-whatsapp'

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
