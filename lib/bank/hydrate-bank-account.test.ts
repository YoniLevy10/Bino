import { describe, expect, it } from 'vitest'
import { hydrateBankAccountRow } from '@/lib/bank/hydrate-bank-account'

describe('hydrateBankAccountRow', () => {
  it('fills null display_name and balance from Financy raw', () => {
    const row = hydrateBankAccountRow({
      id: '1',
      project_id: null,
      external_account_id: 'ext',
      connection_id: 'c1',
      account_type: null,
      display_name: null,
      currency: 'ILS',
      balance: null,
      synced_at: '2026-11-17T00:00:00Z',
      raw: {
        id: 'ext',
        product: 'ויזה זהב עסקי כאל',
        accountType: 'CARD',
        balances: [
          {
            balanceType: 'closingBooked',
            balanceAmount: { amount: '798.49', currency: 'ILS' },
          },
        ],
      },
    })
    expect(row?.display_name).toBe('ויזה זהב עסקי כאל')
    expect(row?.account_type).toBe('CARD')
    expect(row?.balance).toBe(798.49)
    expect(row && 'raw' in row && row.raw).toBeFalsy()
  })

  it('drops deleted accounts', () => {
    expect(
      hydrateBankAccountRow({
        id: '2',
        project_id: null,
        external_account_id: 'ext2',
        connection_id: null,
        account_type: 'CARD',
        display_name: 'x',
        currency: 'ILS',
        balance: 1,
        synced_at: '2026-11-17T00:00:00Z',
        raw: { id: 'ext2', status: 'deleted' },
      })
    ).toBeNull()
  })
})
