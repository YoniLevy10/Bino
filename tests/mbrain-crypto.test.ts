import { describe, expect, it } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/mbrain/crypto'

describe('mbrain token encryption', () => {
  it('round-trips secrets', () => {
    const token = 'EAABtesttoken_do_not_log'
    const blob = encryptSecret(token)
    expect(blob).not.toContain(token)
    expect(decryptSecret(blob)).toBe(token)
  })
})
