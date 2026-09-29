import { describe, expect, it } from 'vitest'
import {
  buildClientResendFrom,
  resolveClientEmailSlug,
  slugifyClientEmailLocalPart,
} from '@/lib/client-email-from'

describe('slugifyClientEmailLocalPart', () => {
  it('slugs latin names', () => {
    expect(slugifyClientEmailLocalPart('Bamakor')).toBe('bamakor')
    expect(slugifyClientEmailLocalPart('Acme Homes Ltd')).toBe('acme-homes-ltd')
  })

  it('maps known Hebrew names', () => {
    expect(slugifyClientEmailLocalPart('סביון')).toBe('savion')
  })
})

describe('resolveClientEmailSlug', () => {
  it('prefers explicit slug', () => {
    expect(resolveClientEmailSlug({ emailSlug: 'savion', clientName: 'סביון' })).toBe('savion')
  })
})

describe('buildClientResendFrom', () => {
  it('builds branded from on bino.casa', () => {
    expect(
      buildClientResendFrom({ clientName: 'Bamakor', domain: 'bino.casa' })
    ).toBe('Bamakor <bamakor@bino.casa>')
  })
})
