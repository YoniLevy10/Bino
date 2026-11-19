import { describe, expect, it } from 'vitest'
import {
  bankAccountKindLabelHe,
  extractAccountDisplayName,
  extractAccountType,
  extractBalanceAmount,
  extractDebtorPaymentAccount,
  extractTxAmount,
  inferCreditorAccountType,
  isFinancyAccountDeleted,
  isFinancyCardAccountType,
  isFinancyCashAccountType,
} from '@/lib/bank/financy-gateway'
import type { FinancyAccount, FinancyTransaction } from '@/lib/bank/types'

describe('financy-gateway helpers', () => {
  it('extractBalanceAmount from money object', () => {
    const account: FinancyAccount = {
      id: 'a1',
      balance: { amount: 120.5, currency: 'ILS' },
    }
    expect(extractBalanceAmount(account)).toBe(120.5)
  })

  it('extractBalanceAmount from numeric balance', () => {
    const account: FinancyAccount = { id: 'a1', balance: 10 }
    expect(extractBalanceAmount(account)).toBe(10)
  })

  it('extractBalanceAmount from Financy balances[] string amounts', () => {
    const account: FinancyAccount = {
      id: 'checking',
      balances: [
        {
          balanceType: 'interimAvailable',
          balanceAmount: { amount: '14150.2', currency: 'ILS' },
          creditLimitIncluded: true,
        },
        {
          balanceType: 'closingBooked',
          balanceAmount: { amount: '5300.69', currency: 'ILS' },
          creditLimitIncluded: false,
        },
      ],
    }
    expect(extractBalanceAmount(account)).toBe(5300.69)
  })

  it('extractAccountDisplayName prefers product for cards and branch for checking', () => {
    expect(
      extractAccountDisplayName({
        id: 'card',
        accountType: 'CARD',
        product: 'ויזה זהב עסקי כאל',
        accountName: 'YONATAN LEVY',
      } as FinancyAccount)
    ).toBe('ויזה זהב עסקי כאל')
    expect(
      extractAccountDisplayName({
        id: 'chk',
        accountType: 'CHECKING',
        accountName: 'LEVY , long owner',
        parsedAccount: { branch: '066', number: '253950874' },
      } as FinancyAccount)
    ).toBe('066-253950874')
  })

  it('extractAccountType reads accountType', () => {
    const account: FinancyAccount = { id: 'a', accountType: 'CHECKING' }
    expect(extractAccountType(account)).toBe('CHECKING')
  })

  it('classifies CARD separately from cash checking/savings', () => {
    expect(isFinancyCardAccountType('CARD')).toBe(true)
    expect(isFinancyCardAccountType('credit_card')).toBe(true)
    expect(isFinancyCardAccountType('CHECKING')).toBe(false)
    expect(isFinancyCardAccountType('SAVINGS')).toBe(false)
    expect(isFinancyCardAccountType(null)).toBe(false)
    expect(isFinancyCashAccountType('CHECKING')).toBe(true)
    expect(isFinancyCashAccountType('CARD')).toBe(false)
    expect(isFinancyCashAccountType(null)).toBe(true)
    expect(bankAccountKindLabelHe('CARD')).toContain('כרטיס')
    expect(bankAccountKindLabelHe('CHECKING')).toContain('מזומן')
  })

  it('isFinancyAccountDeleted detects soft-deleted cards', () => {
    expect(isFinancyAccountDeleted({ id: 'x', status: 'deleted' })).toBe(true)
    expect(isFinancyAccountDeleted({ id: 'y', creditStatus: 'deleted' })).toBe(true)
    expect(isFinancyAccountDeleted({ id: 'z', status: 'enabled' })).toBe(false)
  })

  it('extractTxAmount prefers chargedAmount', () => {
    const tx: FinancyTransaction = {
      id: 't1',
      SK: 'TX#t1',
      amount: {
        chargedAmount: { amount: -50, currency: 'ILS' },
        originalAmount: { amount: -49, currency: 'ILS' },
      },
    }
    expect(extractTxAmount(tx)).toBe(-50)
  })

  it('extractTxAmount parses string charged amounts', () => {
    const tx: FinancyTransaction = {
      id: 't2',
      SK: 'TX#t2',
      amount: {
        chargedAmount: { amount: '-147.78' as unknown as number, currency: 'ILS' },
      },
    }
    expect(extractTxAmount(tx)).toBe(-147.78)
  })

  it('inferCreditorAccountType detects IBAN vs BBAN', () => {
    expect(inferCreditorAccountType('IL620108000000099999999')).toBe('iban')
    expect(inferCreditorAccountType('123456')).toBe('bban')
  })

  it('extractDebtorPaymentAccount prefers parsed BBAN over IBAN', () => {
    expect(
      extractDebtorPaymentAccount({
        id: 'a1',
        accountType: 'CHECKING',
        accountNumber: 'IL590110660000253950874',
        parsedAccount: { bank: '11', branch: '066', number: '253950874' },
      })
    ).toEqual({
      accountType: 'bban',
      accountNumber: '11-066-253950874',
    })
    expect(
      extractDebtorPaymentAccount({
        id: 'a2',
        accountType: 'CHECKING',
        parsedAccount: { bank: '10', branch: '944', number: '50151142' },
      })
    ).toEqual({
      accountType: 'bban',
      accountNumber: '10-944-50151142',
    })
    expect(
      extractDebtorPaymentAccount({
        id: 'a3',
        accountNumber: 'IL590110660000253950874',
      })
    ).toEqual({
      accountType: 'iban',
      accountNumber: 'IL590110660000253950874',
    })
    expect(extractDebtorPaymentAccount({ id: 'a4' })).toBeNull()
  })
})
