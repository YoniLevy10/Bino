import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ATTENDANCE_FUTURE_SKEW_MINUTES,
  ATTENDANCE_SYNC_DELAY_REVIEW_MINUTES,
  type AttendanceEventSource,
  type AttendanceEventType,
  type AttendanceSyncEventInput,
  type AttendanceSyncEventResult,
  type AttendanceSyncStatus,
  type NfcTagRow,
} from '@/lib/attendance-types'

export function computeSyncDelayMinutes(clientRecordedAt: string, serverReceivedAt: Date): number {
  const clientMs = new Date(clientRecordedAt).getTime()
  const serverMs = serverReceivedAt.getTime()
  if (!Number.isFinite(clientMs)) return 0
  return Math.max(0, Math.round((serverMs - clientMs) / 60_000))
}

export function evaluateClientTimestamp(
  clientRecordedAt: string,
  serverReceivedAt: Date
): { sync_delay_minutes: number; suspicious_reason: string | null; force_review: boolean } {
  const sync_delay_minutes = computeSyncDelayMinutes(clientRecordedAt, serverReceivedAt)
  const clientMs = new Date(clientRecordedAt).getTime()
  const serverMs = serverReceivedAt.getTime()
  const reasons: string[] = []
  let force_review = false

  if (!Number.isFinite(clientMs)) {
    reasons.push('invalid_client_timestamp')
    force_review = true
  } else {
    if (clientMs > serverMs + ATTENDANCE_FUTURE_SKEW_MINUTES * 60_000) {
      reasons.push('client_time_in_future')
      force_review = true
    }
    if (sync_delay_minutes > ATTENDANCE_SYNC_DELAY_REVIEW_MINUTES) {
      reasons.push('sync_delay_over_6h')
      force_review = true
    }
  }

  return {
    sync_delay_minutes,
    suspicious_reason: reasons.length ? reasons.join(';') : null,
    force_review,
  }
}

export function resolveEventTypeForTag(
  tagType: 'office' | 'project',
  hasOpenShift: boolean
): AttendanceEventType {
  if (tagType === 'office') {
    return hasOpenShift ? 'clock_out' : 'clock_in'
  }
  return 'project_visit'
}

type ProcessCtx = {
  admin: SupabaseClient
  clientId: string
  workerId: string
  serverReceivedAt: Date
}

export async function processAttendanceSyncEvent(
  ctx: ProcessCtx,
  input: AttendanceSyncEventInput,
  tag: NfcTagRow
): Promise<AttendanceSyncEventResult> {
  const { admin, clientId, workerId, serverReceivedAt } = ctx

  const { data: existing } = await admin
    .from('worker_attendance_events')
    .select('id, sync_status')
    .eq('client_action_id', input.client_action_id)
    .maybeSingle()

  if (existing) {
    return {
      client_action_id: input.client_action_id,
      status: (existing.sync_status as AttendanceSyncStatus) || 'synced',
      event_id: existing.id as string,
      message: 'already_synced',
    }
  }

  const timeEval = evaluateClientTimestamp(input.client_recorded_at, serverReceivedAt)
  let sync_status: AttendanceSyncStatus = timeEval.force_review ? 'pending_review' : 'synced'
  let suspicious_reason = timeEval.suspicious_reason

  const { data: openShift } = await admin
    .from('worker_attendance')
    .select('id, started_at')
    .eq('client_id', clientId)
    .eq('worker_id', workerId)
    .eq('status', 'open')
    .maybeSingle()

  const hasOpenShift = !!openShift

  if (input.event_type === 'clock_in' && hasOpenShift) {
    sync_status = 'conflict'
    suspicious_reason = [suspicious_reason, 'open_shift_exists'].filter(Boolean).join(';')
  }

  if (input.event_type === 'clock_out' && !hasOpenShift) {
    sync_status = sync_status === 'synced' ? 'pending_review' : sync_status
    suspicious_reason = [suspicious_reason, 'no_open_shift'].filter(Boolean).join(';')
  }

  const { data: inserted, error: insErr } = await admin
    .from('worker_attendance_events')
    .insert({
      client_id: clientId,
      worker_id: workerId,
      project_id: tag.project_id,
      tag_id: tag.id,
      tag_code: tag.tag_code,
      event_type: input.event_type,
      client_action_id: input.client_action_id,
      client_recorded_at: input.client_recorded_at,
      server_received_at: serverReceivedAt.toISOString(),
      client_timezone: input.client_timezone ?? null,
      device_id: input.device_id ?? null,
      user_agent: input.user_agent ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      note: input.note ?? null,
      source: input.source,
      sync_status,
      sync_delay_minutes: timeEval.sync_delay_minutes,
      suspicious_reason,
    })
    .select('id')
    .single()

  if (insErr) {
    if (insErr.code === '23505') {
      return { client_action_id: input.client_action_id, status: 'synced', message: 'duplicate' }
    }
    return { client_action_id: input.client_action_id, status: 'rejected', message: insErr.message }
  }

  const eventId = inserted?.id as string

  if (sync_status === 'conflict') {
    return { client_action_id: input.client_action_id, status: sync_status, event_id: eventId, message: suspicious_reason ?? undefined }
  }

  if (input.event_type === 'clock_in' && sync_status === 'synced') {
    const { error: shiftErr } = await admin.from('worker_attendance').insert({
      client_id: clientId,
      worker_id: workerId,
      started_at: input.client_recorded_at,
      start_tag_id: tag.id,
      start_source: input.source as AttendanceEventSource,
      status: 'open',
    })
    if (shiftErr && shiftErr.code !== '23505') {
      await admin
        .from('worker_attendance_events')
        .update({ sync_status: 'conflict', suspicious_reason: 'shift_insert_failed' })
        .eq('id', eventId)
      return { client_action_id: input.client_action_id, status: 'conflict', event_id: eventId }
    }
  }

  if (input.event_type === 'clock_out' && openShift) {
    const endedAt = input.client_recorded_at
    const startedMs = new Date(openShift.started_at as string).getTime()
    const endedMs = new Date(endedAt).getTime()
    const total_minutes =
      Number.isFinite(startedMs) && Number.isFinite(endedMs)
        ? Math.max(0, Math.round((endedMs - startedMs) / 60_000))
        : null

    await admin
      .from('worker_attendance')
      .update({
        ended_at: endedAt,
        end_tag_id: tag.id,
        end_source: input.source,
        total_minutes,
        status: sync_status === 'pending_review' ? 'pending_review' : 'closed',
        updated_at: serverReceivedAt.toISOString(),
      })
      .eq('id', openShift.id as string)
  }

  return {
    client_action_id: input.client_action_id,
    status: sync_status,
    event_id: eventId,
  }
}

export async function resolveTagForClient(
  admin: SupabaseClient,
  clientId: string,
  tagCode: string
): Promise<{ tag: NfcTagRow | null; rejectReason?: string }> {
  const code = tagCode.trim()
  if (!code) return { tag: null, rejectReason: 'empty_tag_code' }

  const { data, error } = await admin
    .from('worker_nfc_tags')
    .select('id, client_id, project_id, tag_code, tag_type, label, is_active')
    .eq('client_id', clientId)
    .eq('tag_code', code)
    .maybeSingle()

  if (error || !data) return { tag: null, rejectReason: 'unknown_tag' }
  if (!data.is_active) return { tag: null, rejectReason: 'inactive_tag' }
  return { tag: data as NfcTagRow }
}
