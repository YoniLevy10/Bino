import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { recordAttendanceScan } from '@/lib/attendance-client'
import type {
  AttendanceEventType,
  NfcTagRow,
  PendingAttendanceEvent,
  WorkerOfflineProfile,
} from '@/lib/attendance-types'
import { getOfflineNfcTags, getWorkerOfflineProfile } from '@/lib/offline-attendance-db'
import {
  cacheWorkerAttendanceBootstrap,
  type AttendanceBootstrapPayload,
} from '@/lib/worker-attendance-bootstrap'
import { syncPendingAttendanceEvents } from '@/lib/sync-attendance'

export type NfcStampPhase = 'done' | 'error' | 'need_bind'

export type NfcStampOutcome = {
  phase: NfcStampPhase
  headline: string
  detail: string
  tagLabel?: string
  eventType?: AttendanceEventType
  /** True when network was awaited before recording the scan (cold path). */
  awaitedNetworkBeforeStamp: boolean
  usedWarmCache: boolean
}

export type NfcStampRecordResult =
  | {
      ok: true
      pending: PendingAttendanceEvent | null
      event_type: AttendanceEventType
      tag: NfcTagRow
      duplicate?: boolean
    }
  | { ok: false; reason: 'unknown_tag' }

export type NfcStampFlowDeps = {
  getProfile: (token: string) => Promise<WorkerOfflineProfile | null>
  getTags: (clientId: string) => Promise<NfcTagRow[]>
  fetchBootstrap: (token: string) => Promise<Response>
  cacheBootstrap: (token: string, data: AttendanceBootstrapPayload) => Promise<void>
  recordScan: (
    workerId: string,
    clientId: string,
    tagCode: string,
    source: 'online' | 'offline',
    geo: null
  ) => Promise<NfcStampRecordResult>
  syncPending: (token: string) => Promise<{ results: Array<{ status?: string }> }>
}

const EVENT_HEADLINE: Record<string, string> = {
  clock_in: 'נכנסת למשמרת',
  clock_out: 'יצאת מהמשמרת',
}

export function createDefaultNfcStampDeps(): NfcStampFlowDeps {
  return {
    getProfile: getWorkerOfflineProfile,
    getTags: getOfflineNfcTags,
    fetchBootstrap: (token) =>
      fetchWithTimeout(`/api/worker/attendance/bootstrap?token=${encodeURIComponent(token)}`),
    cacheBootstrap: cacheWorkerAttendanceBootstrap,
    recordScan: recordAttendanceScan,
    syncPending: syncPendingAttendanceEvents,
  }
}

export async function hasWarmAttendanceCache(
  token: string,
  deps: Pick<NfcStampFlowDeps, 'getProfile' | 'getTags'>
): Promise<{ warm: boolean; profile: WorkerOfflineProfile | null }> {
  const profile = await deps.getProfile(token)
  if (!profile) return { warm: false, profile: null }
  const tags = await deps.getTags(profile.client_id)
  return { warm: tags.length > 0, profile }
}

function applyRecordedScan(
  recorded: NfcStampRecordResult,
  meta: { awaitedNetworkBeforeStamp: boolean; usedWarmCache: boolean }
): NfcStampOutcome {
  if (!recorded.ok) {
    return {
      phase: 'error',
      headline: 'המדבקה לא מוכרת',
      detail: 'פנו למנהל לבדוק שהמדבקה מותקנת במערכת.',
      ...meta,
    }
  }

  // Near-instant re-tap still shows success for the same in/out — never a wait screen.
  return {
    phase: 'done',
    headline: EVENT_HEADLINE[recorded.event_type] ?? 'נרשם',
    detail: '',
    tagLabel: recorded.tag.label || recorded.tag.tag_code,
    eventType: recorded.event_type,
    ...meta,
  }
}

function detailFromSync(results: Array<{ status?: string }>): string | null {
  const last = results[results.length - 1]
  if (last?.status === 'pending_review') return 'נשמר — ממתין לאישור משרד'
  if (last?.status === 'conflict' || last?.status === 'rejected') return 'נשמר — המשרד יבדוק'
  return null
}

async function bootstrapColdPath(
  token: string,
  deps: NfcStampFlowDeps
): Promise<
  | { ok: true; workerId: string; clientId: string; source: 'online' | 'offline' }
  | { ok: false; outcome: NfcStampOutcome }
> {
  try {
    const bootRes = await deps.fetchBootstrap(token)

    if (bootRes.status === 404) {
      return {
        ok: false,
        outcome: {
          phase: 'error',
          headline: 'הקישור לא תקף',
          detail: 'בקשו מהמנהל לשלוח שוב קישור SMS.',
          awaitedNetworkBeforeStamp: true,
          usedWarmCache: false,
        },
      }
    }

    if (bootRes.status === 403) {
      return {
        ok: false,
        outcome: {
          phase: 'error',
          headline: 'חתמת עובדים אינה פעילה',
          detail: 'פנו למנהל.',
          awaitedNetworkBeforeStamp: true,
          usedWarmCache: false,
        },
      }
    }

    if (bootRes.ok) {
      const bootData = (await bootRes.json()) as AttendanceBootstrapPayload
      if (!bootData.worker_id || !bootData.client_id) {
        return {
          ok: false,
          outcome: {
            phase: 'error',
            headline: 'לא ניתן לטעון את נתוני ההחתמה',
            detail: '',
            awaitedNetworkBeforeStamp: true,
            usedWarmCache: false,
          },
        }
      }
      await deps.cacheBootstrap(token, bootData)
      return {
        ok: true,
        workerId: bootData.worker_id,
        clientId: bootData.client_id,
        source: 'online',
      }
    }

    const profile = await deps.getProfile(token)
    if (!profile) {
      return {
        ok: false,
        outcome: {
          phase: 'error',
          headline: 'אין חיבור יציב',
          detail: 'נסו שוב עם Wi-Fi או סלולר.',
          awaitedNetworkBeforeStamp: true,
          usedWarmCache: false,
        },
      }
    }
    return {
      ok: true,
      workerId: profile.worker_id,
      clientId: profile.client_id,
      source: 'offline',
    }
  } catch {
    const profile = await deps.getProfile(token)
    if (!profile) {
      return {
        ok: false,
        outcome: {
          phase: 'error',
          headline: 'שגיאת רשת',
          detail: 'נסו שוב בעוד רגע.',
          awaitedNetworkBeforeStamp: true,
          usedWarmCache: false,
        },
      }
    }
    return {
      ok: true,
      workerId: profile.worker_id,
      clientId: profile.client_id,
      source: 'offline',
    }
  }
}

/**
 * Local-first NFC stamp:
 * - Warm IndexedDB (profile + tags) → stamp immediately; bootstrap+sync in background when online.
 * - Cold / first device → bootstrap once, then stamp, then sync.
 * Never blocks clock_in ↔ clock_out with a "wait a minute" screen.
 */
export async function executeNfcStampFlow(opts: {
  token: string
  tagCode: string
  online: boolean
  deps?: NfcStampFlowDeps
  onSyncDetail?: (detail: string) => void
}): Promise<NfcStampOutcome> {
  const deps = opts.deps ?? createDefaultNfcStampDeps()
  const { warm, profile } = await hasWarmAttendanceCache(opts.token, deps)

  if (warm && profile) {
    const recorded = await deps.recordScan(
      profile.worker_id,
      profile.client_id,
      opts.tagCode,
      opts.online ? 'online' : 'offline',
      null
    )
    const outcome = applyRecordedScan(recorded, {
      awaitedNetworkBeforeStamp: false,
      usedWarmCache: true,
    })

    if (outcome.phase === 'done') {
      if (!opts.online) {
        outcome.detail = 'נשמר במכשיר — יסתנכרן כשהרשת תחזור'
      } else {
        void (async () => {
          try {
            const bootRes = await deps.fetchBootstrap(opts.token)
            if (bootRes.ok) {
              const bootData = (await bootRes.json()) as AttendanceBootstrapPayload
              if (bootData.worker_id && bootData.client_id) {
                await deps.cacheBootstrap(opts.token, bootData)
              }
            }
          } catch {
            /* keep local stamp */
          }
          try {
            const sync = await deps.syncPending(opts.token)
            const detail = detailFromSync(sync.results)
            if (detail) opts.onSyncDetail?.(detail)
          } catch {
            opts.onSyncDetail?.('נשמר במכשיר — יסתנכרן כשהרשת תחזור')
          }
        })()
      }
    }

    return outcome
  }

  if (!opts.online) {
    return {
      phase: 'error',
      headline: 'פעם אחת עם אינטרנט',
      detail: 'פתחו את קישור ה-SMS כשיש קליט, ואז אפשר גם בלי רשת.',
      awaitedNetworkBeforeStamp: false,
      usedWarmCache: false,
    }
  }

  const boot = await bootstrapColdPath(opts.token, deps)
  if (!boot.ok) return boot.outcome

  const recorded = await deps.recordScan(
    boot.workerId,
    boot.clientId,
    opts.tagCode,
    boot.source,
    null
  )
  const outcome = applyRecordedScan(recorded, {
    awaitedNetworkBeforeStamp: true,
    usedWarmCache: false,
  })

  if (outcome.phase === 'done' && opts.online) {
    void deps
      .syncPending(opts.token)
      .then((sync) => {
        const detail = detailFromSync(sync.results)
        if (detail) opts.onSyncDetail?.(detail)
      })
      .catch(() => {
        opts.onSyncDetail?.('נשמר במכשיר — יסתנכרן כשהרשת תחזור')
      })
  }

  return outcome
}
