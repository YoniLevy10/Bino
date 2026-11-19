import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getOutboundMode,
  isGrowOutboundAllowed,
  isOutboundLiveAllowed,
  isStagingRuntime,
} from '@/lib/outbound-mode'

describe('outbound-mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to live on production without staging signals', () => {
    vi.stubEnv('BINO_OUTBOUND_MODE', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://bino.casa')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getOutboundMode()).toBe('live')
    expect(isOutboundLiveAllowed()).toBe(true)
    expect(isGrowOutboundAllowed()).toBe(true)
    expect(isStagingRuntime()).toBe(false)
  })

  it('forces mock on staging.bino.casa', () => {
    vi.stubEnv('BINO_OUTBOUND_MODE', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.bino.casa')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(isStagingRuntime()).toBe(true)
    expect(getOutboundMode()).toBe('mock')
    expect(isOutboundLiveAllowed()).toBe(false)
    expect(isGrowOutboundAllowed()).toBe(false)
  })

  it('honors explicit sandbox mode', () => {
    vi.stubEnv('BINO_OUTBOUND_MODE', 'sandbox')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.bino.casa')
    expect(getOutboundMode()).toBe('sandbox')
    expect(isOutboundLiveAllowed()).toBe(false)
    expect(isGrowOutboundAllowed()).toBe(true)
  })
})
