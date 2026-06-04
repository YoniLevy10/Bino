import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { AttendanceSyncEventInput, AttendanceSyncEventResult } from '@/lib/attendance-types'
import {
  getPendingAttendanceEvents,
  markPendingEventFailed,
  markPendingEventSynced,
} from '@/lib/offline-attendance-db'

export type SyncAttendanceSummary = {
  synced: number
  failed: number
  results: AttendanceSyncEventResult[]
}

export async function syncPendingAttendanceEvents(accessToken: string): Promise<SyncAttendanceSummary> {
  const pending = await getPendingAttendanceEvents()
  if (pending.length === 0) {
    return { synced: 0, failed: 0, results: [] }
  }

  const events: AttendanceSyncEventInput[] = pending.map((p) => ({
    client_action_id: p.client_action_id,
    tag_code: p.tag_code,
    event_type: p.event_type,
    client_recorded_at: p.client_recorded_at,
    client_timezone: p.client_timezone,
    device_id: p.device_id,
    user_agent: p.user_agent,
    lat: p.lat,
    lng: p.lng,
    note: p.note,
    source: p.source,
  }))

  const res = await fetchWithTimeout('/api/worker/attendance/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, events }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    results?: AttendanceSyncEventResult[]
  }

  if (!res.ok) {
    const err = body.error || 'sync_failed'
    for (const p of pending) {
      await markPendingEventFailed(p.client_action_id, err)
    }
    return { synced: 0, failed: pending.length, results: [] }
  }

  const results = body.results ?? []
  let synced = 0
  let failed = 0

  for (const r of results) {
    if (r.status === 'synced' || r.status === 'pending_review') {
      await markPendingEventSynced(r.client_action_id)
      synced++
    } else if (r.status === 'rejected' || r.status === 'conflict') {
      await markPendingEventFailed(r.client_action_id, r.message || r.status)
      failed++
    } else {
      await markPendingEventSynced(r.client_action_id)
      synced++
    }
  }

  return { synced, failed, results }
}
