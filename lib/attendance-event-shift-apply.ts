import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttendanceEventSource } from '@/lib/attendance-types'

type EventRow = {
  id: string
  worker_id: string
  event_type: string
  client_recorded_at: string
  tag_id: string | null
  source: string | null
}

/** When a manager approves an event, apply the matching shift open/close if missing. */
export async function applyShiftWhenEventApproved(
  admin: SupabaseClient,
  clientId: string,
  event: EventRow
): Promise<void> {
  if (event.event_type === 'clock_in') {
    const { data: open } = await admin
      .from('worker_attendance')
      .select('id')
      .eq('client_id', clientId)
      .eq('worker_id', event.worker_id)
      .eq('status', 'open')
      .maybeSingle()

    if (open) return

    await admin.from('worker_attendance').insert({
      client_id: clientId,
      worker_id: event.worker_id,
      started_at: event.client_recorded_at,
      start_tag_id: event.tag_id,
      start_source: (event.source as AttendanceEventSource) ?? 'online',
      status: 'open',
    })
    return
  }

  if (event.event_type === 'clock_out') {
    const { data: open } = await admin
      .from('worker_attendance')
      .select('id, started_at')
      .eq('client_id', clientId)
      .eq('worker_id', event.worker_id)
      .eq('status', 'open')
      .maybeSingle()

    if (!open) return

    const endedAt = event.client_recorded_at
    const startedMs = new Date(open.started_at as string).getTime()
    const endedMs = new Date(endedAt).getTime()
    const total_minutes =
      Number.isFinite(startedMs) && Number.isFinite(endedMs)
        ? Math.max(0, Math.round((endedMs - startedMs) / 60_000))
        : null

    await admin
      .from('worker_attendance')
      .update({
        ended_at: endedAt,
        end_tag_id: event.tag_id,
        end_source: (event.source as AttendanceEventSource) ?? 'online',
        total_minutes,
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', open.id as string)
  }
}
