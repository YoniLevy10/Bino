import { afterEach, describe, expect, it } from 'vitest'
import { createIcountPayLink } from '@/lib/payments/icount-client'

describe('createIcountPayLink scaffold', () => {
  const prev = process.env.ICOUNT_COLLECTIONS_ENABLED

  afterEach(() => {
    if (prev === undefined) delete process.env.ICOUNT_COLLECTIONS_ENABLED
    else process.env.ICOUNT_COLLECTIONS_ENABLED = prev
  })

  it('returns platform-off when flag disabled', async () => {
    delete process.env.ICOUNT_COLLECTIONS_ENABLED
    const res = await createIcountPayLink(
      { cid: 'c', apiToken: 't', paypageId: '1' },
      {
        amount: 10,
        description: 'test',
        fullName: 'דייר בדיקה',
        publicToken: 'tok',
        successUrl: 'https://bino.casa/ok',
        ipnUrl: 'https://bino.casa/api/webhook/icount?token=x',
      }
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('ICOUNT_PLATFORM_OFF')
  })

  it('returns not_implemented when platform on', async () => {
    process.env.ICOUNT_COLLECTIONS_ENABLED = 'true'
    const res = await createIcountPayLink(
      { cid: 'c', apiToken: 't', paypageId: '1' },
      {
        amount: 10,
        description: 'test',
        fullName: 'דייר בדיקה',
        publicToken: 'tok',
        successUrl: 'https://bino.casa/ok',
        ipnUrl: 'https://bino.casa/api/webhook/icount?token=x',
      }
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('ICOUNT_CREATE_NOT_IMPLEMENTED')
  })
})
