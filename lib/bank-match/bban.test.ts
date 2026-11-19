import { describe, expect, it } from 'vitest'
import { buildIsraeliBban, parseIsraeliBban } from '@/lib/bank-match/bban'

describe('israeli BBAN', () => {
  it('builds Financy-style bank-branch-account', () => {
    expect(
      buildIsraeliBban({ bankCode: '10', branchNumber: '944', accountNumber: '50151141' })
    ).toBe('10-944-50151141')
  })

  it('pads short bank/branch', () => {
    expect(
      buildIsraeliBban({ bankCode: '1', branchNumber: '12', accountNumber: '12345' })
    ).toBe('01-012-12345')
  })

  it('rejects invalid parts', () => {
    expect(
      buildIsraeliBban({ bankCode: '', branchNumber: '1', accountNumber: '123' })
    ).toBeNull()
  })

  it('parses round-trip', () => {
    expect(parseIsraeliBban('10-944-50151141')).toEqual({
      bankCode: '10',
      branchNumber: '944',
      accountNumber: '50151141',
    })
  })
})
