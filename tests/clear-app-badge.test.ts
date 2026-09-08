import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('clearAppBadgeBestEffort', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears navigator and service worker registration badges', async () => {
    const clearAppBadge = vi.fn(async () => undefined)
    const clearRegBadge = vi.fn(async () => undefined)

    vi.stubGlobal('navigator', {
      clearAppBadge,
      serviceWorker: {
        ready: Promise.resolve({
          clearAppBadge: clearRegBadge,
        }),
      },
    })

    const { clearAppBadgeBestEffort } = await import('@/lib/push-client-core')
    await clearAppBadgeBestEffort()

    expect(clearAppBadge).toHaveBeenCalledTimes(1)
    expect(clearRegBadge).toHaveBeenCalledTimes(1)
  })
})
