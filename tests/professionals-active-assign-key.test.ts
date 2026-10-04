import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

describe('professionalsActiveAssign query key', () => {
  it('is stable across dashboard/tickets for the same client', () => {
    const a = queryKeys.professionalsActiveAssign('client-1')
    const b = queryKeys.professionalsActiveAssign('client-1')
    expect(a).toEqual(b)
    expect(a).toEqual(['professionals', 'client-1', 'active-assign'])
    expect(queryKeys.professionalsActiveAssign('client-2')).not.toEqual(a)
  })
})
