import { after } from 'next/server'

/**
 * Kill-switch: set SYNC_TICKET_NOTIFICATIONS=1 to await notifications
 * inside the request (legacy behavior) instead of scheduling after the response.
 */
export function shouldSyncTicketNotifications(): boolean {
  return process.env.SYNC_TICKET_NOTIFICATIONS === '1'
}

/**
 * Run work after the HTTP response is sent (Next.js `after()`), unless the
 * sync kill-switch is on — then the work is awaited inline.
 *
 * Never throws to the caller when running in background mode; errors are logged.
 */
export function runAfterResponse(taskName: string, work: () => Promise<void>): void | Promise<void> {
  const run = async () => {
    try {
      await work()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[runAfterResponse:${taskName}]`, message, err)
    }
  }

  if (shouldSyncTicketNotifications()) {
    return run()
  }

  after(() => run())
}
