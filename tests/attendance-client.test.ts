import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeLocalAttendanceState } from '@/lib/attendance-client'
import { DUPLICATE_SCAN_WINDOW_MS, isDuplicateScan } from '@/lib/attendance-duplicate'
import { mergeAttendanceStateFromBootstrap } from '@/lib/worker-attendance-bootstrap'
import { executeNfcStampFlow, type NfcStampFlowDeps } from '@/lib/nfc-stamp-flow'
import type { NfcTagRow, PendingAttendanceEvent, WorkerOfflineProfile } from '@/lib/attendance-types'

describe('attendance-client local state', () => {
  it('clears stale open shift after 10 hours offline', () => {
    const started = new Date(Date.now() - 11 * 3_600_000).toISOString()
    const next = normalizeLocalAttendanceState({
      has_open_shift: true,
      open_shift_id: 'local',
      last_event_type: 'clock_in',
      last_event_at: started,
      last_tag_code: 'OFFICE1',
    })
    expect(next?.has_open_shift).toBe(false)
    expect(next?.open_shift_id).toBeNull()
  })

  it('keeps fresh open shift', () => {
    const started = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const state = {
      has_open_shift: true,
      open_shift_id: 'local',
      last_event_type: 'clock_in' as const,
      last_event_at: started,
      last_tag_code: 'OFFICE1',
    }
    expect(normalizeLocalAttendanceState(state)).toEqual(state)
  })
})

describe('mergeAttendanceStateFromBootstrap', () => {
  const now = Date.now()

  it('preserves last_tag_code within duplicate window even when server has no open shift', () => {
    const localAt = new Date(now - 30_000).toISOString()
    const merged = mergeAttendanceStateFromBootstrap(
      {
        has_open_shift: true,
        open_shift_id: 'local',
        last_event_type: 'clock_in',
        last_event_at: localAt,
        last_tag_code: 'DOOR1',
      },
      {
        has_open_shift: false,
        open_shift_id: null,
        open_shift_started_at: null,
      },
      now
    )

    expect(merged.last_tag_code).toBe('DOOR1')
    expect(merged.last_event_at).toBe(localAt)
    expect(merged.has_open_shift).toBe(true)
    expect(isDuplicateScan(merged.last_tag_code, merged.last_event_at, 'DOOR1', now)).toBe(true)
  })

  it('preserves last_tag_code for the same open shift outside the duplicate window', () => {
    const localAt = new Date(now - DUPLICATE_SCAN_WINDOW_MS - 5_000).toISOString()
    const merged = mergeAttendanceStateFromBootstrap(
      {
        has_open_shift: true,
        open_shift_id: 'shift-1',
        last_event_type: 'clock_in',
        last_event_at: localAt,
        last_tag_code: 'DOOR1',
      },
      {
        has_open_shift: true,
        open_shift_id: 'shift-1',
        open_shift_started_at: localAt,
      },
      now
    )

    expect(merged.last_tag_code).toBe('DOOR1')
    expect(merged.has_open_shift).toBe(true)
    expect(merged.open_shift_id).toBe('shift-1')
  })

  it('does not invent last_tag_code when local cache had none', () => {
    const started = new Date(now - 3_600_000).toISOString()
    const merged = mergeAttendanceStateFromBootstrap(
      null,
      {
        has_open_shift: true,
        open_shift_id: 'shift-9',
        open_shift_started_at: started,
      },
      now
    )
    expect(merged.last_tag_code).toBeNull()
    expect(merged.has_open_shift).toBe(true)
    expect(merged.open_shift_id).toBe('shift-9')
    expect(merged.last_event_type).toBe('clock_in')
    expect(merged.last_event_at).toBe(started)
  })
})

describe('executeNfcStampFlow local-first', () => {
  const profile: WorkerOfflineProfile = {
    worker_id: 'w1',
    client_id: 'c1',
    full_name: 'Test',
    access_token: 'tok',
    device_id: 'd1',
    saved_at: new Date().toISOString(),
  }
  const tag: NfcTagRow = {
    id: 't1',
    client_id: 'c1',
    project_id: null,
    tag_code: 'DOOR1',
    tag_type: 'office',
    label: 'דלת',
    is_active: true,
  }
  const pending: PendingAttendanceEvent = {
    client_action_id: 'a1',
    tag_code: 'DOOR1',
    event_type: 'clock_in',
    client_recorded_at: new Date().toISOString(),
    client_timezone: 'Asia/Jerusalem',
    device_id: 'd1',
    user_agent: null,
    lat: null,
    lng: null,
    note: null,
    source: 'online',
    sync_state: 'pending',
    last_error: null,
    created_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warm cache stamps without awaiting network', async () => {
    let fetchStarted = false
    let recordOrder = ''
    const deps: NfcStampFlowDeps = {
      getProfile: async () => profile,
      getTags: async () => [tag],
      fetchBootstrap: async () => {
        fetchStarted = true
        await new Promise((r) => setTimeout(r, 50))
        return new Response(
          JSON.stringify({
            worker_id: 'w1',
            client_id: 'c1',
            full_name: 'Test',
            tags: [tag],
            attendance_state: {
              has_open_shift: false,
              open_shift_id: null,
              open_shift_started_at: null,
            },
          }),
          { status: 200 }
        )
      },
      cacheBootstrap: async () => {
        recordOrder += 'cache;'
      },
      recordScan: async () => {
        recordOrder += `scan(fetch=${fetchStarted});`
        return { ok: true, pending, event_type: 'clock_in', tag }
      },
      syncPending: async () => {
        recordOrder += 'sync;'
        return { results: [{ status: 'ok' }] }
      },
    }

    const outcome = await executeNfcStampFlow({
      token: 'tok',
      tagCode: 'DOOR1',
      online: true,
      deps,
    })

    expect(outcome.phase).toBe('done')
    expect(outcome.usedWarmCache).toBe(true)
    expect(outcome.awaitedNetworkBeforeStamp).toBe(false)
    expect(recordOrder.startsWith('scan(fetch=false);')).toBe(true)

    await new Promise((r) => setTimeout(r, 80))
    expect(recordOrder).toContain('cache;')
    expect(recordOrder).toContain('sync;')
  })

  it('cold online path bootstraps before stamp', async () => {
    let recordOrder = ''
    const deps: NfcStampFlowDeps = {
      getProfile: async () => null,
      getTags: async () => [],
      fetchBootstrap: async () => {
        recordOrder += 'fetch;'
        return new Response(
          JSON.stringify({
            worker_id: 'w1',
            client_id: 'c1',
            full_name: 'Test',
            tags: [tag],
            attendance_state: {
              has_open_shift: false,
              open_shift_id: null,
              open_shift_started_at: null,
            },
          }),
          { status: 200 }
        )
      },
      cacheBootstrap: async () => {
        recordOrder += 'cache;'
      },
      recordScan: async () => {
        recordOrder += 'scan;'
        return { ok: true, pending, event_type: 'clock_in', tag }
      },
      syncPending: async () => {
        recordOrder += 'sync;'
        return { results: [] }
      },
    }

    const outcome = await executeNfcStampFlow({
      token: 'tok',
      tagCode: 'DOOR1',
      online: true,
      deps,
    })

    expect(outcome.phase).toBe('done')
    expect(outcome.usedWarmCache).toBe(false)
    expect(outcome.awaitedNetworkBeforeStamp).toBe(true)
    expect(recordOrder.startsWith('fetch;cache;scan;')).toBe(true)
  })
})
