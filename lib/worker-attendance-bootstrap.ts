import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { LocalAttendanceState, NfcTagRow } from '@/lib/attendance-types'
import {
  getOrCreateDeviceId,
  initOfflineAttendanceDB,
  saveOfflineNfcTags,
  saveWorkerOfflineProfile,
  updateLocalAttendanceState,
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

export async function fetchAndCacheWorkerAttendanceBootstrap(
  accessToken: string
): Promise<AttendanceBootstrapPayload | null> {
  const res = await fetchWithTimeout(
    `/api/worker/attendance/bootstrap?token=${encodeURIComponent(accessToken)}`
  )
  if (!res.ok) return null
  const data = (await res.json()) as AttendanceBootstrapPayload & { error?: string }
  if (!data.worker_id || !data.client_id) return null

  await initOfflineAttendanceDB()
  await saveWorkerOfflineProfile({
    worker_id: data.worker_id,
    client_id: data.client_id,
    full_name: data.full_name,
    access_token: accessToken,
    device_id: getOrCreateDeviceId(),
    saved_at: new Date().toISOString(),
  })
  await saveOfflineNfcTags(data.client_id, data.tags ?? [])

  const state: LocalAttendanceState & { worker_id: string } = {
    worker_id: data.worker_id,
    has_open_shift: data.attendance_state?.has_open_shift ?? false,
    open_shift_id: data.attendance_state?.open_shift_id ?? null,
    last_event_type: data.attendance_state?.has_open_shift ? 'clock_in' : null,
    last_event_at: data.attendance_state?.open_shift_started_at ?? null,
    last_tag_code: null,
  }
  await updateLocalAttendanceState(state)

  return data
}
