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

type ScanPhase = 'loading' | 'ready' | 'done' | 'error'

const EVENT_LABELS: Record<string, string> = {
  clock_in: 'כניסה לעבודה',
  clock_out: 'יציאה מהעבודה',
  project_visit: 'ביקור בפרויקט',
}

function NfcScanInner() {
  const searchParams = useSearchParams()
  const online = useOnlineStatus()
  const [phase, setPhase] = useState<ScanPhase>('loading')
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    void (async () => {
      const tagCode = searchParams.get('t')?.trim()
      if (!tagCode) {
        setPhase('error')
        setMessage('חסר קוד תג')
        return
      }

      const fromUrl = searchParams.get('token')?.trim()
      const token = normalizeWorkerToken(fromUrl) ?? readWorkerToken()
      if (!token) {
        setPhase('error')
        setMessage('יש להתחבר לאזור האישי תחילה')
        setDetail('פתחו את הקישור האישי מה-SMS ואז סרקו שוב.')
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
            setMessage('תוסף חתמת עובדים אינו פעיל לחשבון זה')
            return
          }
          if (bootRes.ok) {
            await fetchAndCacheWorkerAttendanceBootstrap(token)
          }
        } catch {
          setPhase('error')
          setMessage('שגיאת רשת')
          return
        }
      } else {
        const profile = await getWorkerOfflineProfile(token)
        if (!profile) {
          setPhase('error')
          setMessage('כדי לעבוד ללא אינטרנט, צריך לפתוח את המערכת פעם אחת כשיש חיבור.')
          return
        }
        workerId = profile.worker_id
        clientId = profile.client_id
      }

      const source = online ? 'online' : 'offline'
      const recorded = await recordAttendanceScan(workerId, clientId, tagCode, source)

      if (!recorded.ok) {
        setPhase('error')
        setMessage('המדבקה לא מוכרת במכשיר הזה. התחבר לאינטרנט ונסה שוב.')
        return
      }

      if (online) {
        try {
          const sync = await syncPendingAttendanceEvents(token)
          const last = sync.results[sync.results.length - 1]
          if (last?.status === 'synced') {
            setPhase('done')
            setMessage('הפעולה סונכרנה בהצלחה.')
          } else if (last?.status === 'pending_review') {
            setPhase('done')
            setMessage('הפעולה נשמרה — ממתינה לאישור משרד.')
          } else if (last?.status === 'conflict' || last?.status === 'rejected') {
            setPhase('done')
            setMessage('הפעולה נשמרה אך דורשת בדיקה במשרד.')
          } else {
            setPhase('done')
            setMessage('הפעולה נשמרה במכשיר וממתינה לסנכרון.')
          }
        } catch {
          setPhase('done')
          setMessage('הפעולה נשמרה במכשיר וממתינה לסנכרון.')
        }
      } else {
        setPhase('done')
        setMessage('הפעולה נשמרה במכשיר וממתינה לסנכרון.')
      }

      setDetail(
        `${EVENT_LABELS[recorded.event_type] ?? recorded.event_type} · ${recorded.tag.label || recorded.tag.tag_code}`
      )
    })()
  }, [searchParams, online])

  return (
    <div style={shell} dir="rtl">
      <div style={box}>
        {phase === 'loading' ? (
          <LoadingSpinner />
        ) : (
          <>
            <h1 style={title}>{phase === 'error' ? 'לא בוצע' : 'נוכחות'}</h1>
            <p style={msg}>{message}</p>
            {detail ? <p style={sub}>{detail}</p> : null}
            {!online && phase === 'done' ? (
              <p style={sub}>אתה במצב ללא אינטרנט. הפעולות ייסתנכרנו כשהחיבור יחזור.</p>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => { window.location.href = '/worker' }}>
              חזרה לאזור האישי
            </Button>
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

const title: CSSProperties = {
  margin: 0,
  fontSize: 22,
  color: theme.colors.textPrimary,
}

const msg: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.5,
  color: theme.colors.textPrimary,
}

const sub: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: theme.colors.textMuted,
}
