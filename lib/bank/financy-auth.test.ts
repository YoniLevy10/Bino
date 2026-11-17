import { describe, expect, it } from 'vitest'
import { isFinancyCredentialsComplete } from '@/lib/bank/financy-auth'

describe('financy-auth', () => {
  it('requires all three credential fields', () => {
    expect(
      isFinancyCredentialsComplete({
        clientId: 'c',
        clientSecret: 's',
        userId: 'u',
      })
    ).toBe(true)
    expect(
      isFinancyCredentialsComplete({
        clientId: 'c',
        clientSecret: '',
        userId: 'u',
      })
    ).toBe(false)
  })
})
