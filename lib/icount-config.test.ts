import { afterEach, describe, expect, it } from 'vitest'
import {
  isIcountCollectionsPlatformEnabled,
  readIcountWebhookSecret,
} from '@/lib/icount-config'

describe('icount-config', () => {
  const prevEnabled = process.env.ICOUNT_COLLECTIONS_ENABLED
  const prevSecret = process.env.ICOUNT_WEBHOOK_SECRET

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.ICOUNT_COLLECTIONS_ENABLED
    else process.env.ICOUNT_COLLECTIONS_ENABLED = prevEnabled
    if (prevSecret === undefined) delete process.env.ICOUNT_WEBHOOK_SECRET
    else process.env.ICOUNT_WEBHOOK_SECRET = prevSecret
  })

  it('platform flag defaults off', () => {
    delete process.env.ICOUNT_COLLECTIONS_ENABLED
    expect(isIcountCollectionsPlatformEnabled({})).toBe(false)
  })

  it('accepts true/1', () => {
    expect(isIcountCollectionsPlatformEnabled({ ICOUNT_COLLECTIONS_ENABLED: 'true' })).toBe(
      true
    )
    expect(isIcountCollectionsPlatformEnabled({ ICOUNT_COLLECTIONS_ENABLED: '1' })).toBe(true)
  })

  it('reads webhook secret', () => {
    expect(readIcountWebhookSecret({ ICOUNT_WEBHOOK_SECRET: '  abc  ' })).toBe('abc')
    expect(readIcountWebhookSecret({})).toBeNull()
  })
})
