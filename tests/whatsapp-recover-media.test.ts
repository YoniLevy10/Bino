import { describe, it, expect } from 'vitest'
import { reporterPhoneLookupKeys } from '@/lib/whatsapp-recover-stashed-media'

describe('reporterPhoneLookupKeys', () => {
  it('includes raw and normalized 972 forms', () => {
    const keys = reporterPhoneLookupKeys('972501234567')
    expect(keys).toContain('972501234567')
    expect(keys).toContain('0501234567')
  })

  it('normalizes local 05x format', () => {
    const keys = reporterPhoneLookupKeys('0501234567')
    expect(keys).toContain('972501234567')
    expect(keys).toContain('0501234567')
  })
})
