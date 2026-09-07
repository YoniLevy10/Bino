import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('acknowledgePushAlertsBestEffort', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears navigator badge and closes SW notifications', async () => {
    const clearAppBadge = vi.fn(async () => undefined)
    const close = vi.fn()
    const getNotifications = vi.fn(async () => [{ close }, { close }])
    const clearRegBadge = vi.fn(async () => undefined)

    vi.stubGlobal('navigator', {
      clearAppBadge,
      serviceWorker: {
        ready: Promise.resolve({
          clearAppBadge: clearRegBadge,
          getNotifications,
        }),
      },
    })

    const { acknowledgePushAlertsBestEffort } = await import('@/lib/push-client-core')
    await acknowledgePushAlertsBestEffort()

    expect(clearAppBadge).toHaveBeenCalledTimes(1)
    expect(clearRegBadge).toHaveBeenCalledTimes(1)
    expect(getNotifications).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(2)
  })
})
