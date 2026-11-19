/**
 * Bridge: maintenance_tasks with due_at → calendar_events (event_type=maintenance).
 * Best-effort; never fails the task mutation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAINTENANCE_CADENCE_GOOGLE_COLOR_ID,
  cadenceLabel,
  normalizeMaintenanceCadence,
  type MaintenanceCadence,
} from '@/lib/maintenance/maintenance-cadence'
import { syncEventToGoogleCalendar } from '@/lib/google/google-calendar'

function endsAtFromDue(dueIso: string): string {
  const d = new Date(dueIso)
  if (Number.isNaN(d.getTime())) return dueIso
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

export async function syncMaintenanceTaskToCalendar(
  admin: SupabaseClient,
  opts: {
    clientId: string
    userId: string
    taskId: string
    title: string
    dueAt: string | null
    cadence: MaintenanceCadence | string | null
    projectId: string | null
    calendarEventId: string | null
    status: string
  }
): Promise<string | null> {
  const cadence = normalizeMaintenanceCadence(opts.cadence)

  // Done / no due → leave existing event; do not create
  if (opts.status === 'DONE' || !opts.dueAt) {
    return opts.calendarEventId
  }

  const starts = opts.dueAt
  const ends = endsAtFromDue(opts.dueAt)
  const title = `[${cadenceLabel(cadence)}] ${opts.title}`
  const description = `משימת תחזוקה (${cadenceLabel(cadence)}) · task:${opts.taskId}`
  const now = new Date().toISOString()
  const colorId = MAINTENANCE_CADENCE_GOOGLE_COLOR_ID[cadence]

  try {
    if (opts.calendarEventId) {
      const { data: existing } = await admin
        .from('calendar_events')
        .select('id, google_event_id')
        .eq('id', opts.calendarEventId)
        .eq('client_id', opts.clientId)
        .maybeSingle()

      if (existing?.id) {
        await admin
          .from('calendar_events')
          .update({
            title,
            description,
            starts_at: starts,
            ends_at: ends,
            all_day: false,
            project_id: opts.projectId,
            event_type: 'maintenance',
            updated_at: now,
          })
          .eq('id', existing.id)
          .eq('client_id', opts.clientId)

        const googleEventId = await syncEventToGoogleCalendar(admin, opts.clientId, {
          id: existing.id as string,
          title,
          description,
          location: null,
          starts_at: starts,
          ends_at: ends,
          all_day: false,
          google_event_id: (existing as { google_event_id?: string | null }).google_event_id,
          colorId,
        })
        if (googleEventId) {
          await admin
            .from('calendar_events')
            .update({ google_event_id: googleEventId, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .eq('client_id', opts.clientId)
        }
        return existing.id as string
      }
    }

    const { data: created, error } = await admin
      .from('calendar_events')
      .insert({
        client_id: opts.clientId,
        title,
        description,
        location: null,
        starts_at: starts,
        ends_at: ends,
        all_day: false,
        project_id: opts.projectId,
        event_type: 'maintenance',
        created_by: opts.userId,
        updated_at: now,
      })
      .select('id')
      .single()

    if (error || !created?.id) {
      console.error('[maintenance-calendar] insert', error?.message)
      return null
    }

    const googleEventId = await syncEventToGoogleCalendar(admin, opts.clientId, {
      id: created.id as string,
      title,
      description,
      location: null,
      starts_at: starts,
      ends_at: ends,
      all_day: false,
      colorId,
    })
    if (googleEventId) {
      await admin
        .from('calendar_events')
        .update({ google_event_id: googleEventId, updated_at: new Date().toISOString() })
        .eq('id', created.id)
        .eq('client_id', opts.clientId)
    }

    await admin
      .from('maintenance_tasks')
      .update({ calendar_event_id: created.id, updated_at: new Date().toISOString() })
      .eq('id', opts.taskId)
      .eq('client_id', opts.clientId)

    return created.id as string
  } catch (e) {
    console.error('[maintenance-calendar] sync failed', e)
    return opts.calendarEventId
  }
}
