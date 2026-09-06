import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { AttendanceEventType, LocalAttendanceState, NfcTagRow } from '@/lib/attendance-types'
import { DUPLICATE_SCAN_WINDOW_MS } from '@/lib/attendance-duplicate'
import {
  getLocalAttendanceState,
  getOrCreateDeviceId,
  initOfflineAttendanceDB,
  saveAttendanceBootstrapBundle,
} from '@/lib/offline-attendance-db'

export type AttendanceBootstrapPayload = {
  worker_id: string
  client_id: string
  full_name: string
  tags: NfcTagRow[]
  attendance_state: {
    has_open_shift: boolean
    open_shift_id: string | null
    open_shift_started_at: string | null
  }
}

/**
 * Merge server bootstrap shift state with existing local state.
 * Preserves last_tag_code (and fresher local stamp timing) so client-side
 * duplicate detection survives a background bootstrap refresh.
 */
export function mergeAttendanceStateFromBootstrap(
  existing: LocalAttendanceState | null,
  attendance_state: AttendanceBootstrapPayload['attendance_state'],
  nowMs: number = Date.now()
): LocalAttendanceState {
  const serverHasOpen = attendance_state?.has_open_shift ?? false
  const serverOpenId = attendance_state?.open_shift_id ?? null
  const serverStartedAt = attendance_state?.open_shift_started_at ?? null

  let has_open_shift = serverHasOpen
  let open_shift_id = serverOpenId
  let last_event_type: AttendanceEventType | null = serverHasOpen ? 'clock_in' : null
  let last_event_at: string | null = serverStartedAt
  let last_tag_code: string | null = null

  if (existing?.last_tag_code && existing.last_event_at) {
    const localMs = new Date(existing.last_event_at).getTime()
    const inDupWindow =
      Number.isFinite(localMs) && nowMs - localMs < DUPLICATE_SCAN_WINDOW_MS
    const sameOpenShift =
      serverHasOpen &&
      existing.has_open_shift &&
      (existing.open_shift_id === 'local' ||
        !serverOpenId ||
        !existing.open_shift_id ||
        existing.open_shift_id === serverOpenId)

    if (inDupWindow || sameOpenShift) {
      last_tag_code = existing.last_tag_code
    }

    if (inDupWindow) {
      const serverMs = serverStartedAt ? new Date(serverStartedAt).getTime() : NaN
      if (!Number.isFinite(serverMs) || localMs >= serverMs) {
        last_event_at = existing.last_event_at
        last_event_type = existing.last_event_type
        has_open_shift = existing.has_open_shift
        open_shift_id = existing.open_shift_id
      }
    }
  }

  return {
    has_open_shift,
    open_shift_id,
    last_event_type,
    last_event_at,
    last_tag_code,
  }
}

export async function cacheWorkerAttendanceBootstrap(
  accessToken: string,
  data: AttendanceBootstrapPayload
): Promise<void> {
  await initOfflineAttendanceDB()
  const existing = await getLocalAttendanceState(data.worker_id)
  const merged = mergeAttendanceStateFromBootstrap(existing, data.attendance_state)

  await saveAttendanceBootstrapBundle({
    profile: {
      worker_id: data.worker_id,
      client_id: data.client_id,
      full_name: data.full_name,
      access_token: accessToken,
      device_id: getOrCreateDeviceId(),
      saved_at: new Date().toISOString(),
    },
    clientId: data.client_id,
    tags: data.tags ?? [],
    state: {
      worker_id: data.worker_id,
      ...merged,
    },
  })
}

export async function fetchAndCacheWorkerAttendanceBootstrap(
  accessToken: string
): Promise<AttendanceBootstrapPayload | null> {
  const res = await fetchWithTimeout(
    `/api/worker/attendance/bootstrap?token=${encodeURIComponent(accessToken)}`
  )
  if (!res.ok) return null
  const data = (await res.json()) as AttendanceBootstrapPayload & { error?: string }
  if (!data.worker_id || !data.client_id) return null

  await cacheWorkerAttendanceBootstrap(accessToken, data)
  return data
}
