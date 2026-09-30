import { describe, expect, it } from 'vitest'
import {
  shouldHardReloadAfterBackground,
  shouldRefreshAccessToken,
} from '@/lib/pwa-session-resume'

describe('pwa session resume helpers', () => {
  it('hard-reloads only after long background', () => {
    const now = 1_000_000
    expect(shouldHardReloadAfterBackground(null, now)).toBe(false)
    expect(shouldHardReloadAfterBackground(now - 60_000, now)).toBe(false)
    expect(shouldHardReloadAfterBackground(now - 15 * 60_000, now)).toBe(true)
    expect(shouldHardReloadAfterBackground(now + 1000, now)).toBe(false)
  })

  it('refreshes access token near expiry', () => {
    const now = 1_000_000
    expect(shouldRefreshAccessToken(null, now)).toBe(true)
    expect(shouldRefreshAccessToken(Math.floor(now / 1000) + 120, now)).toBe(false)
    expect(shouldRefreshAccessToken(Math.floor(now / 1000) + 30, now)).toBe(true)
    expect(shouldRefreshAccessToken(Math.floor(now / 1000) - 10, now)).toBe(true)
  })
})
