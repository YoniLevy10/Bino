import { beforeEach, describe, expect, it, vi } from 'vitest'

const afterMock = vi.fn()
const systemLogsInsert = vi.fn()
const notifyPlatformOps = vi.fn()

vi.mock('next/server', () => ({
  after: (...args: unknown[]) => afterMock(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'system_logs') {
        return { insert: systemLogsInsert }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/platform-ops-alert', () => ({
  notifyPlatformOps: (...args: unknown[]) => notifyPlatformOps(...args),
}))

import { logRunAfterFailure, runAfterResponse } from '@/lib/run-after-response'

describe('runAfterResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SYNC_TICKET_NOTIFICATIONS
    systemLogsInsert.mockResolvedValue({ error: null })
    notifyPlatformOps.mockResolvedValue(undefined)
    // Default: after schedules and immediately runs the returned promise (Fluid waitUntil).
    afterMock.mockImplementation((fn: () => Promise<void>) => {
      void fn()
    })
  })

  it('schedules via after() and returns a Promise so waitUntil can track work', async () => {
    // Capture only — do not auto-run (we assert the returned Promise shape).
    afterMock.mockImplementation(() => undefined)

    let finished = false
    runAfterResponse('unit-task', async () => {
      finished = true
    })

    expect(afterMock).toHaveBeenCalledTimes(1)
    const scheduled = afterMock.mock.calls[0][0] as () => Promise<void>
    expect(typeof scheduled).toBe('function')
    // The callback itself must return a Promise (not void fire-and-forget).
    const ret = scheduled()
    expect(ret).toBeInstanceOf(Promise)
    await ret
    expect(finished).toBe(true)
  })

  it('logs system_logs + ops alert when background work throws', async () => {
    afterMock.mockImplementation((fn: () => Promise<void>) => {
      void fn()
    })

    runAfterResponse(
      'recommendations-detectors:client-1',
      async () => {
        throw new Error('detector boom')
      },
      {
        logSource: 'recommendations.detectors',
        clientId: 'client-1',
        alertOps: true,
        alertTitle: 'Recommendations detector scan failed',
      }
    )

    // Flush microtasks from after(() => run())
    await vi.waitFor(() => {
      expect(systemLogsInsert).toHaveBeenCalled()
    })

    expect(systemLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        source: 'recommendations.detectors',
        message: 'detector boom',
        payload: expect.objectContaining({
          taskName: 'recommendations-detectors:client-1',
          clientId: 'client-1',
          error: 'detector boom',
        }),
      })
    )

    await vi.waitFor(() => {
      expect(notifyPlatformOps).toHaveBeenCalled()
    })
    expect(notifyPlatformOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'operational_error',
        title: 'Recommendations detector scan failed',
        message: 'detector boom',
        clientId: 'client-1',
        details: expect.objectContaining({
          context: 'recommendations.detectors',
          taskName: 'recommendations-detectors:client-1',
        }),
      })
    )
  })

  it('falls back to fire-and-forget when after() throws (non-request scope)', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('after() outside request scope')
    })

    let ran = false
    runAfterResponse('fallback-task', async () => {
      ran = true
    })

    await vi.waitFor(() => {
      expect(ran).toBe(true)
    })
  })

  it('awaits inline when SYNC_TICKET_NOTIFICATIONS=1', async () => {
    process.env.SYNC_TICKET_NOTIFICATIONS = '1'
    let ran = false
    const result = runAfterResponse('sync-task', async () => {
      ran = true
    })
    expect(result).toBeInstanceOf(Promise)
    await result
    expect(ran).toBe(true)
    expect(afterMock).not.toHaveBeenCalled()
  })
})

describe('logRunAfterFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    systemLogsInsert.mockResolvedValue({ error: null })
  })

  it('defaults source from taskName prefix without embedding client ids', async () => {
    await logRunAfterFailure('recommendations-detectors:uuid-here', new Error('x'))
    expect(systemLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'runAfterResponse.recommendations-detectors',
      })
    )
  })
})
