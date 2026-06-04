import type {
  AttendanceEventSource,
  AttendanceEventType,
  LocalAttendanceState,
  NfcTagRow,
  PendingAttendanceEvent,
} from '@/lib/attendance-types'
import { resolveEventTypeForTag } from '@/lib/attendance-sync-server'
import {
  addPendingAttendanceEvent,
  getLocalAttendanceState,
  getOfflineNfcTags,
  getOrCreateDeviceId,
  updateLocalAttendanceState,
} from '@/lib/offline-attendance-db'

export function findOfflineTag(tags: NfcTagRow[], tagCode: string): NfcTagRow | null {
  const code = tagCode.trim()
  return tags.find((t) => t.is_active && t.tag_code === code) ?? null
}

export async function buildAttendanceAction(
  workerId: string,
  tag: NfcTagRow,
  source: AttendanceEventSource
): Promise<{ event_type: AttendanceEventType; pending: PendingAttendanceEvent }> {
  const state = (await getLocalAttendanceState(workerId)) ?? {
    has_open_shift: false,
    open_shift_id: null,
    last_event_type: null,
    last_event_at: null,
    last_tag_code: null,
  }

  const event_type = resolveEventTypeForTag(tag.tag_type, state.has_open_shift)
  const client_recorded_at = new Date().toISOString()

  const pending: PendingAttendanceEvent = {
    client_action_id: crypto.randomUUID(),
    tag_code: tag.tag_code,
    event_type,
    client_recorded_at,
    client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    device_id: getOrCreateDeviceId(),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    lat: null,
    lng: null,
    note: null,
    source,
    sync_state: 'pending',
    last_error: null,
    created_at: client_recorded_at,
  }

  return { event_type, pending }
}

export async function applyLocalAttendanceAfterAction(
  workerId: string,
  tag: NfcTagRow,
  event_type: AttendanceEventType,
  recordedAt: string
): Promise<void> {
  const prev = (await getLocalAttendanceState(workerId)) ?? {
    has_open_shift: false,
    open_shift_id: null,
    last_event_type: null,
    last_event_at: null,
    last_tag_code: null,
  }

  let has_open_shift = prev.has_open_shift
  if (event_type === 'clock_in') has_open_shift = true
  if (event_type === 'clock_out') has_open_shift = false

  await updateLocalAttendanceState({
    worker_id: workerId,
    has_open_shift,
    open_shift_id: event_type === 'clock_in' ? 'local' : event_type === 'clock_out' ? null : prev.open_shift_id,
    last_event_type: event_type,
    last_event_at: recordedAt,
    last_tag_code: tag.tag_code,
  })
}

export async function recordAttendanceScan(
  workerId: string,
  clientId: string,
  tagCode: string,
  source: AttendanceEventSource
): Promise<
  | { ok: true; pending: PendingAttendanceEvent; event_type: AttendanceEventType; tag: NfcTagRow }
  | { ok: false; reason: 'unknown_tag' }
> {
  const tags = await getOfflineNfcTags(clientId)
  const tag = findOfflineTag(tags, tagCode)
  if (!tag) return { ok: false, reason: 'unknown_tag' }

  const { event_type, pending } = await buildAttendanceAction(workerId, tag, source)
  await addPendingAttendanceEvent(pending)
  await applyLocalAttendanceAfterAction(workerId, tag, event_type, pending.client_recorded_at)
  return { ok: true, pending, event_type, tag }
}
