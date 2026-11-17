import { afterEach, describe, expect, it } from 'vitest'
import {
  assertTenantCanEnableIcount,
  buildIcountCollectionsAccountStatus,
  icountCredentialsFromRow,
  isIcountCollectionsConfigured,
  normalizeCollectionsPaymentProvider,
  shouldUseIcountCollections,
} from '@/lib/icount-credentials'

const PREV = process.env.ICOUNT_COLLECTIONS_ENABLED

afterEach(() => {
  if (PREV === undefined) delete process.env.ICOUNT_COLLECTIONS_ENABLED
  else process.env.ICOUNT_COLLECTIONS_ENABLED = PREV
})

describe('icount-credentials', () => {
  it('parses complete credentials', () => {
    expect(
      icountCredentialsFromRow({
        icount_cid: ' acme ',
        icount_api_token: ' tok ',
        icount_paypage_id: ' 12 ',
      })
    ).toEqual({ cid: 'acme', apiToken: 'tok', paypageId: '12' })
  })

  it('requires enabled + full creds for configured', () => {
    expect(
      isIcountCollectionsConfigured({
        icount_enabled: true,
        icount_cid: 'c',
        icount_api_token: 't',
        icount_paypage_id: '1',
      })
    ).toBe(true)
    expect(
      isIcountCollectionsConfigured({
        icount_enabled: false,
        icount_cid: 'c',
        icount_api_token: 't',
        icount_paypage_id: '1',
      })
    ).toBe(false)
  })

  it('shouldUseIcountCollections needs platform + provider + config', () => {
    process.env.ICOUNT_COLLECTIONS_ENABLED = 'true'
    const row = {
      icount_enabled: true,
      icount_cid: 'c',
      icount_api_token: 't',
      icount_paypage_id: '1',
      collections_payment_provider: 'icount',
    }
    expect(shouldUseIcountCollections(row)).toBe(true)
    expect(
      shouldUseIcountCollections({ ...row, collections_payment_provider: 'grow' })
    ).toBe(false)
    delete process.env.ICOUNT_COLLECTIONS_ENABLED
    expect(shouldUseIcountCollections(row)).toBe(false)
  })

  it('assertTenantCanEnableIcount blocks incomplete enable', () => {
    expect(
      assertTenantCanEnableIcount({
        enabled: true,
        cid: null,
        hasToken: false,
        paypageId: null,
      }).ok
    ).toBe(false)
    expect(
      assertTenantCanEnableIcount({
        enabled: true,
        cid: 'c',
        hasToken: true,
        paypageId: '9',
      }).ok
    ).toBe(true)
  })

  it('buildIcountCollectionsAccountStatus surfaces platform off', () => {
    const status = buildIcountCollectionsAccountStatus({
      platformEnabled: false,
      enabled: true,
      cid: 'c',
      hasToken: true,
      paypageId: '1',
      provider: 'icount',
    })
    expect(status.ready).toBe(false)
    expect(status.message).toMatch(/ICOUNT_COLLECTIONS_ENABLED/)
  })

  it('normalizes provider', () => {
    expect(normalizeCollectionsPaymentProvider('icount')).toBe('icount')
    expect(normalizeCollectionsPaymentProvider('grow')).toBe('grow')
    expect(normalizeCollectionsPaymentProvider(null)).toBe('grow')
  })
})
