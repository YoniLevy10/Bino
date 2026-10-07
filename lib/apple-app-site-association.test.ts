import { describe, expect, it } from 'vitest'
import { buildAppleAppSiteAssociation } from '@/lib/apple-app-site-association'

describe('apple-app-site-association', () => {
  it('stays unpublished until a real team id exists', () => {
    expect(buildAppleAppSiteAssociation('')).toBeNull()
    expect(buildAppleAppSiteAssociation('not-a-team')).toBeNull()
  })

  it('binds the paid team to the BINO bundle', () => {
    const body = buildAppleAppSiteAssociation('ab12cd34ef')
    expect(body?.webcredentials.apps).toEqual(['AB12CD34EF.casa.bino.app'])
    expect(body?.applinks.details[0]?.appIDs).toEqual(['AB12CD34EF.casa.bino.app'])
  })
})
