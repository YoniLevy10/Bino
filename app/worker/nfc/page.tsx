'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { normalizeWorkerToken, readWorkerToken, writeWorkerToken } from '@/lib/worker-portal-storage'
import {
  getWorkerOfflineProfile,
  initOfflineAttendanceDB,
} from '@/lib/offline-attendance-db'
import { recordAttendanceScan } from '@/lib/attendance-client'
import { syncPendingAttendanceEvents } from '@/lib/sync-attendance'
import { fetchAndCacheWorkerAttendanceBootstrap } from '@/lib/worker-attendance-bootstrap'
import { normalizeTagCode } from '@/lib/nfc-tag-utils'

type ScanPhase = 'loading' | 'ready' | 'done' | 'error' | 'duplicate'

const EVENT_LABELS: Record<string, string> = {
  clock_in: 'כניסה לעבודה',
  clock_out: 'יציאה מהעבודה',
  project_visit: 'ביקור בבניין',
}

function readGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    )
  })
}

function NfcScanInner() {
  const searchParams = useSearchParams()
  const online = useOnlineStatus()
  const [phase, setPhase] = useState<ScanPhase>('loading')
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    void (async () => {
      const tagCode = normalizeTagCode(searchParams.get('t') ?? '')
      if (!tagCode) {
        setPhase('error')
        setMessage('חסר קוד מדבקה')
        return
      }

      const fromUrl = searchParams.get('token')?.trim()
      const token = normalizeWorkerToken(fromUrl) ?? readWorkerToken()
      if (!token) {
        setPhase('error')
        setMessage('יש להתחבר לאזור האישי תחילה')
        setDetail('פתחו את הקישור האישי מה-SMS ואז הצמידו שוב את הטלפון.')
        return
      }

      if (fromUrl) writeWorkerToken(token)

      await initOfflineAttendanceDB()

      let workerId: string
      let clientId: string

      if (online) {
        try {
          const authRes = await fetchWithTimeout(`/api/worker-auth?token=${encodeURIComponent(token)}`)
          if (!authRes.ok) {
            setPhase('error')
            setMessage('הקישור לא תקף')
            return
          }
          const auth = (await authRes.json()) as { worker_id?: string; client_id?: string }
          if (!auth.worker_id || !auth.client_id) {
            setPhase('error')
            setMessage('הקישור לא תקף')
            return
          }
          workerId = auth.worker_id
          clientId = auth.client_id
          const bootRes = await fetchWithTimeout(
            `/api/worker/attendance/bootstrap?token=${encodeURIComponent(token)}`
          )
          if (bootRes.status === 403) {
            setPhase('error')
            setMessage('תוסף חתמת עובדים אינו פעיל')
            return
          }
          if (!bootRes.ok) {
            setPhase('error')
            setMessage('לא ניתן לטעון את נתוני ההחתמה')
            setDetail('בדקו חיבור לאינטרנט ונסו שוב.')
            return
          }
          await fetchAndCacheWorkerAttendanceBootstrap(token)
        } catch {
          setPhase('error')
          setMessage('שגיאת רשת')
          return
        }
      } else {
        const profile = await getWorkerOfflineProfile(token)
        if (!profile) {
          setPhase('error')
          setMessage('כדי לעבוד ללא אינטרנט, פתחו את הקישור פעם אחת כשיש חיבור.')
          return
        }
        workerId = profile.worker_id
        clientId = profile.client_id
      }

      const geo = await readGeo()
      const source = online ? 'online' : 'offline'
      const recorded = await recordAttendanceScan(workerId, clientId, tagCode, source, geo)

      if (!recorded.ok) {
        if (recorded.reason === 'duplicate_scan') {
          setPhase('duplicate')
          setMessage('כבר נרשמה החתמה לפני רגע')
          setDetail('המתינו דקה ונסו שוב, או המשיכו לעבוד.')
        } else {
          setPhase('error')
          setMessage('המדבקה לא מוכרת')
          setDetail('התחברו לאינטרנט ונסו שוב, או פנו למנהל.')
        }
        return
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80])
      }

      if (online) {
        try {
          const sync = await syncPendingAttendanceEvents(token)
          const last = sync.results[sync.results.length - 1]
          if (last?.status === 'pending_review') {
            setMessage('נשמר — ממתין לאישור משרד')
          } else if (last?.status === 'conflict' || last?.status === 'rejected') {
            setMessage('נשמר — דורש בדיקה במשרד')
          } else {
            setMessage('נרשם בהצלחה!')
          }
        } catch {
          setMessage('נשמר — יסתנכרן כשהרשת תחזור')
        }
      } else {
        setMessage('נשמר — יסתנכרן כשהרשת תחזור')
      }

      setPhase('done')
      setDetail(
        `${EVENT_LABELS[recorded.event_type] ?? recorded.event_type} · ${recorded.tag.label || recorded.tag.tag_code}`
      )

      window.setTimeout(() => {
        window.location.href = '/worker'
      }, 3000)
    })()
  }, [searchParams, online])

  const isSuccess = phase === 'done'
  const icon = phase === 'error' ? '✕' : phase === 'duplicate' ? '⏱' : isSuccess ? '✓' : null

  return (
    <div style={shell} dir="rtl">
      <div style={box}>
        {phase === 'loading' ? (
          <LoadingSpinner />
        ) : (
          <>
            {icon ? (
              <div
                style={{
                  ...bigIcon,
                  background:
                    phase === 'error'
                      ? theme.colors.errorMuted
                      : phase === 'duplicate'
                        ? theme.colors.warningMuted
                        : theme.colors.successMuted,
                  color:
                    phase === 'error'
                      ? theme.colors.error
                      : phase === 'duplicate'
                        ? theme.colors.warning
                        : theme.colors.success,
                }}
              >
                {icon}
              </div>
            ) : null}
            <h1 style={title}>{phase === 'error' ? 'לא בוצע' : isSuccess ? 'בוצע!' : 'רגע...'}</h1>
            <p style={msg}>{message}</p>
            {detail ? <p style={sub}>{detail}</p> : null}
            {isSuccess ? <p style={sub}>מעבירים לאזור האישי...</p> : null}
            {!online && isSuccess ? (
              <p style={sub}>אין אינטרנט — ההחתמה תעלה כשיחזור קליט.</p>
            ) : null}
            {!isSuccess ? (
              <Button variant="primary" size="sm" onClick={() => { window.location.href = '/worker' }}>
                חזרה לאזור האישי
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default function WorkerNfcPage() {
  return (
    <Suspense
      fallback={
        <div style={shell} dir="rtl">
          <LoadingSpinner />
        </div>
      }
    >
      <NfcScanInner />
    </Suspense>
  )
}

const shell: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: theme.colors.background,
  padding: 24,
}

const box: CSSProperties = {
  maxWidth: 400,
  width: '100%',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
}

const bigIcon: CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 40,
  fontWeight: 700,
  marginBottom: 4,
}

const title: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 800,
  color: theme.colors.textPrimary,
}

const msg: CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.5,
  color: theme.colors.textPrimary,
}

const sub: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: theme.colors.textMuted,
}
