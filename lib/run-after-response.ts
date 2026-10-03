import { after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Kill-switch: set SYNC_TICKET_NOTIFICATIONS=1 to await notifications
 * inside the request (legacy behavior) instead of scheduling after the response.
 */
export function shouldSyncTicketNotifications(): boolean {
  return process.env.SYNC_TICKET_NOTIFICATIONS === '1'
}

export type RunAfterResponseOptions = {
  /**
   * `system_logs.source` on failure.
   * Defaults to `runAfterResponse.<taskName>` (colon segments collapsed).
   */
  logSource?: string
  /** Included in system_logs.payload / ops alert for tenant scoping. */
  clientId?: string | null
  /** When true, also email platform ops (deduped ~30 min) on failure. */
  alertOps?: boolean
  /** Ops email title (Hebrew/English). Defaults from taskName. */
  alertTitle?: string
}

function defaultLogSource(taskName: string): string {
  // Keep sources stable and queryable (no UUIDs / client ids in source).
  const base = taskName.split(':')[0]?.trim() || 'unknown'
  return `runAfterResponse.${base}`
}

/**
 * Persist a background-task failure so Fluid/serverless `after()` work cannot
 * fail silently (console-only). Best-effort — never throws.
 */
export async function logRunAfterFailure(
  taskName: string,
  err: unknown,
  options?: RunAfterResponseOptions
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const source = (options?.logSource || defaultLogSource(taskName)).slice(0, 120)
  const payload: Record<string, unknown> = {
    taskName,
    error: message,
  }
  if (err instanceof Error && err.stack) {
    payload.stack = err.stack.slice(0, 4000)
  }
  if (options?.clientId) {
    payload.clientId = options.clientId
  }

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('system_logs').insert({
      level: 'error',
      source,
      message: message.slice(0, 2000),
      payload,
    })
    if (error) {
      console.error(`[runAfterResponse:${taskName}] system_logs insert failed:`, error.message)
    }
  } catch (e) {
    console.error(
      `[runAfterResponse:${taskName}] system_logs insert threw:`,
      e instanceof Error ? e.message : String(e)
    )
  }

  if (!options?.alertOps) return

  try {
    const { notifyPlatformOps } = await import('@/lib/platform-ops-alert')
    void notifyPlatformOps({
      kind: 'operational_error',
      title: options.alertTitle || `Background task failed: ${taskName}`,
      message,
      clientId: options.clientId,
      details: { context: source, taskName },
    })
  } catch (e) {
    console.error(
      `[runAfterResponse:${taskName}] ops alert threw:`,
      e instanceof Error ? e.message : String(e)
    )
  }
}

/**
 * Run work after the HTTP response is sent (Next.js `after()`), unless the
 * sync kill-switch is on — then the work is awaited inline.
 *
 * On Vercel Fluid / serverless, `after()` is backed by `waitUntil` and keeps
 * the isolate alive until the returned Promise settles. Callers must not wrap
 * work in a fire-and-forget `void` inside `after()` — that can drop the task
 * when the function freezes.
 *
 * When `after()` is unavailable (unit tests / non-request context), falls back
 * to a fire-and-forget promise so callers never throw from scheduling alone.
 *
 * Never throws to the caller when running in background mode; errors are
 * console.error'd and written to `system_logs` (optional platform ops alert).
 */
export function runAfterResponse(
  taskName: string,
  work: () => Promise<void>,
  options?: RunAfterResponseOptions
): void | Promise<void> {
  const run = async () => {
    try {
      await work()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[runAfterResponse:${taskName}]`, message, err)
      await logRunAfterFailure(taskName, err, options)
    }
  }

  if (shouldSyncTicketNotifications()) {
    return run()
  }

  try {
    // Return the Promise from the after callback so Next/Vercel waitUntil
    // extends the invocation until detector / notify work finishes.
    after(() => run())
  } catch {
    // Outside Next request scope (vitest, scripts): still execute without blocking the caller.
    void run()
  }
}
