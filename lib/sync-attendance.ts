import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { AttendanceSyncEventInput, AttendanceSyncEventResult } from '@/lib/attendance-types'
import {
  getPendingAttendanceEvents,
  markPendingEventFailed,
  markPendingEventSynced,
} from '@/lib/offline-attendance-db'
import { readLastWorkerId } from '@/lib/worker-portal-storage'

export type SyncAttendanceSummary = {
  synced: number
  failed: number
  results: AttendanceSyncEventResult[]
}

const SYNC_BATCH_SIZE = 50

async function postSyncBatch(
  accessToken: string,
  events: AttendanceSyncEventInput[]
): Promise<{ ok: boolean; error?: string; results: AttendanceSyncEventResult[] }> {
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
    return { ok: false, error: body.error || 'sync_failed', results: [] }
  }
  return { ok: true, results: body.results ?? [] }
}

/**
 * Sync offline attendance queue for the active worker in batches of ≤50 (audit #35).
 */
export async function syncPendingAttendanceEvents(accessToken: string): Promise<SyncAttendanceSummary> {
  const workerId = readLastWorkerId()
  const pending = await getPendingAttendanceEvents(workerId || undefined)
  if (pending.length === 0) {
    return { synced: 0, failed: 0, results: [] }
  }

  let synced = 0
  let failed = 0
  const allResults: AttendanceSyncEventResult[] = []

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    const chunk = pending.slice(i, i + SYNC_BATCH_SIZE)
    const events: AttendanceSyncEventInput[] = chunk.map((p) => ({
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

    const batch = await postSyncBatch(accessToken, events)
    if (!batch.ok) {
      for (const p of chunk) {
        await markPendingEventFailed(p.client_action_id, batch.error || 'sync_failed')
      }
      failed += chunk.length
      continue
    }

    const results = batch.results
    allResults.push(...results)
    for (const r of results) {
      if (r.status === 'synced' || r.status === 'pending_review' || r.status === 'conflict') {
        await markPendingEventSynced(r.client_action_id)
        synced++
      } else if (r.status === 'rejected') {
        await markPendingEventFailed(r.client_action_id, r.message || r.status)
        failed++
      } else {
        await markPendingEventFailed(r.client_action_id, r.message || 'unknown_status')
        failed++
      }
    }
  }

  return { synced, failed, results: allResults }
}
