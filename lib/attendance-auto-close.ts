import type { SupabaseClient } from '@supabase/supabase-js'

/** Open shifts older than this are auto-closed so workers can clock in again. */
export const ATTENDANCE_AUTO_CLOSE_HOURS = 10

const AUTO_CLOSE_ADMIN_NOTE = 'סגירה אוטומטית אחרי 10 שעות (לא זוהתה יציאה)'

type OpenShiftRow = {
  id: string
  started_at: string
  client_id: string
  worker_id: string
}

export function computeAutoCloseTimes(
  startedAt: string,
  now: Date = new Date()
): { shouldClose: boolean; ended_at: string; total_minutes: number } {
  const startedMs = new Date(startedAt).getTime()
  if (!Number.isFinite(startedMs)) {
    return { shouldClose: false, ended_at: '', total_minutes: 0 }
  }

  const autoCloseMs = startedMs + ATTENDANCE_AUTO_CLOSE_HOURS * 3_600_000
  const shouldClose = now.getTime() >= autoCloseMs
  const total_minutes = ATTENDANCE_AUTO_CLOSE_HOURS * 60

  return {
    shouldClose,
    ended_at: new Date(autoCloseMs).toISOString(),
    total_minutes,
  }
}

export function isShiftStaleForAutoClose(startedAt: string, now: Date = new Date()): boolean {
  return computeAutoCloseTimes(startedAt, now).shouldClose
}

/** Close one open shift that exceeded the auto-close window. Returns true if closed. */
export async function autoCloseStaleOpenShiftIfNeeded(
  admin: SupabaseClient,
  shift: OpenShiftRow,
  now: Date = new Date()
): Promise<boolean> {
  const { shouldClose, ended_at, total_minutes } = computeAutoCloseTimes(shift.started_at, now)
  if (!shouldClose) return false

  const { error } = await admin
    .from('worker_attendance')
    .update({
      ended_at,
      total_minutes,
      status: 'missing_checkout',
      admin_note: AUTO_CLOSE_ADMIN_NOTE,
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id)
    .eq('status', 'open')

  return !error
}

/** Auto-close stale open shifts for one worker (bootstrap / sync). */
export async function autoCloseStaleOpenShiftsForWorker(
  admin: SupabaseClient,
  clientId: string,
  workerId: string,
  now: Date = new Date()
): Promise<number> {
  const { data: rows, error } = await admin
    .from('worker_attendance')
    .select('id, started_at, client_id, worker_id')
    .eq('client_id', clientId)
    .eq('worker_id', workerId)
    .eq('status', 'open')

  if (error || !rows?.length) return 0

  let closed = 0
  for (const row of rows) {
    const ok = await autoCloseStaleOpenShiftIfNeeded(admin, row as OpenShiftRow, now)
    if (ok) closed++
  }
  return closed
}

/** Cron: auto-close all stale open shifts platform-wide. */
export async function autoCloseAllStaleOpenShifts(
  admin: SupabaseClient,
  opts?: { clientIds?: string[]; now?: Date }
): Promise<{ found: number; closed: number }> {
  const now = opts?.now ?? new Date()
  const cutoff = new Date(now.getTime() - ATTENDANCE_AUTO_CLOSE_HOURS * 3_600_000).toISOString()

  let query = admin
    .from('worker_attendance')
    .select('id, started_at, client_id, worker_id')
    .eq('status', 'open')
    .lt('started_at', cutoff)

  if (opts?.clientIds?.length) {
    query = query.in('client_id', opts.clientIds)
  }

  const { data: stale, error } = await query

  if (error || !stale?.length) {
    return { found: stale?.length ?? 0, closed: 0 }
  }

  let closed = 0
  for (const row of stale) {
    const ok = await autoCloseStaleOpenShiftIfNeeded(admin, row as OpenShiftRow, now)
    if (ok) closed++
  }

  return { found: stale.length, closed }
}
