import type {
  AttendanceEventSource,
  AttendanceEventType,
  LocalAttendanceState,
  NfcTagRow,
  PendingAttendanceEvent,
} from '@/lib/attendance-types'
import { normalizeTagCode } from '@/lib/nfc-tag-utils'
import { isDuplicateScan } from '@/lib/attendance-duplicate'
import { resolveEventTypeForTag } from '@/lib/attendance-sync-server'
import {
  addPendingAttendanceEvent,
  getLocalAttendanceState,
  getOfflineNfcTags,
  getOrCreateDeviceId,
  updateLocalAttendanceState,
} from '@/lib/offline-attendance-db'
import { isShiftStaleForAutoClose } from '@/lib/attendance-auto-close'

export function findOfflineTag(tags: NfcTagRow[], tagCode: string): NfcTagRow | null {
  const code = normalizeTagCode(tagCode)
  return tags.find((t) => t.is_active && normalizeTagCode(t.tag_code) === code) ?? null
}

/** Reset stale local open-shift state after 10h so offline scans stay consistent with server. */
export function normalizeLocalAttendanceState(
  state: LocalAttendanceState | null
): LocalAttendanceState | null {
  if (!state?.has_open_shift || state.last_event_type !== 'clock_in' || !state.last_event_at) {
    return state
  }
  if (!isShiftStaleForAutoClose(state.last_event_at)) return state
  return {
    ...state,
    has_open_shift: false,
    open_shift_id: null,
  }
}

export async function buildAttendanceAction(
  workerId: string,
  tag: NfcTagRow,
  source: AttendanceEventSource,
  geo?: { lat: number; lng: number } | null
): Promise<{ event_type: AttendanceEventType; pending: PendingAttendanceEvent }> {
  const rawState = (await getLocalAttendanceState(workerId)) ?? {
    has_open_shift: false,
    open_shift_id: null,
    last_event_type: null,
    last_event_at: null,
    last_tag_code: null,
  }
  const state = normalizeLocalAttendanceState(rawState) ?? rawState
  if (state !== rawState) {
    await updateLocalAttendanceState({ worker_id: workerId, ...state })
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
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
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
  source: AttendanceEventSource,
  geo?: { lat: number; lng: number } | null
): Promise<
  | { ok: true; pending: PendingAttendanceEvent; event_type: AttendanceEventType; tag: NfcTagRow }
  | { ok: false; reason: 'unknown_tag' | 'duplicate_scan' }
> {
  const tags = await getOfflineNfcTags(clientId)
  const tag = findOfflineTag(tags, tagCode)
  if (!tag) return { ok: false, reason: 'unknown_tag' }

  const rawState = await getLocalAttendanceState(workerId)
  const state = normalizeLocalAttendanceState(rawState)
  if (state && rawState && state !== rawState) {
    await updateLocalAttendanceState({ worker_id: workerId, ...state })
  }
  if (isDuplicateScan(state?.last_tag_code, state?.last_event_at, tag.tag_code)) {
    return { ok: false, reason: 'duplicate_scan' }
  }

  const { event_type, pending } = await buildAttendanceAction(workerId, tag, source, geo)
  await addPendingAttendanceEvent(pending)
  await applyLocalAttendanceAfterAction(workerId, tag, event_type, pending.client_recorded_at)
  return { ok: true, pending, event_type, tag }
}
