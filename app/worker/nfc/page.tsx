'use client'

/**
 * Worker NFC stamp — tap sticker → auto clock in/out.
 * No GPS prompt, no redirect into the tickets portal.
 * One-time SMS link required to bind this phone (OS/browser limit).
 */

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
import {
  cacheWorkerAttendanceBootstrap,
  type AttendanceBootstrapPayload,
} from '@/lib/worker-attendance-bootstrap'
import { normalizeTagCode } from '@/lib/nfc-tag-utils'

type ScanPhase = 'loading' | 'done' | 'error' | 'duplicate' | 'need_bind'

const EVENT_HEADLINE: Record<string, string> = {
  clock_in: 'נכנסת למשמרת',
  clock_out: 'יצאת מהמשמרת',
}

function NfcScanInner() {
  const searchParams = useSearchParams()
  const online = useOnlineStatus()
  const [phase, setPhase] = useState<ScanPhase>('loading')
  const [headline, setHeadline] = useState('')
  const [detail, setDetail] = useState('')
  const [tagLabel, setTagLabel] = useState('')

  useEffect(() => {
    void (async () => {
      const tagCode = normalizeTagCode(searchParams.get('t') ?? '')
      if (!tagCode) {
        setPhase('error')
        setHeadline('חסר קוד מדבקה')
        setDetail('הצמידו את הטלפון למדבקה על הדלת.')
        return
      }

      const fromUrl = searchParams.get('token')?.trim()
      const token = normalizeWorkerToken(fromUrl) ?? readWorkerToken()
      if (!token) {
        setPhase('need_bind')
        setHeadline('פעם אחת בלבד')
        setDetail('פתחו את הקישור האישי מה-SMS בטלפון הזה, ואז הצמידו שוב למדבקה.')
        return
      }

      if (fromUrl) {
        writeWorkerToken(token)
        // Keep sticker URL clean after bind (token only needed once).
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          window.history.replaceState(null, '', `${url.pathname}${url.search}`)
        } catch {
          /* ignore */
        }
      }

      await initOfflineAttendanceDB()

      let workerId: string
      let clientId: string
      let usedOfflineFallback = false

      if (online) {
        try {
          const [authRes, bootRes] = await Promise.all([
            fetchWithTimeout(`/api/worker-auth?token=${encodeURIComponent(token)}`),
            fetchWithTimeout(`/api/worker/attendance/bootstrap?token=${encodeURIComponent(token)}`),
          ])

          if (!authRes.ok) {
            setPhase('error')
            setHeadline('הקישור לא תקף')
            setDetail('בקשו מהמנהל לשלוח שוב קישור SMS.')
            return
          }
          const auth = (await authRes.json()) as { worker_id?: string; client_id?: string }
          if (!auth.worker_id || !auth.client_id) {
            setPhase('error')
            setHeadline('הקישור לא תקף')
            return
          }

          if (bootRes.status === 403) {
            setPhase('error')
            setHeadline('חתמת עובדים אינה פעילה')
            setDetail('פנו למנהל.')
            return
          }

          if (bootRes.ok) {
            const bootData = (await bootRes.json()) as AttendanceBootstrapPayload
            if (!bootData.worker_id || !bootData.client_id) {
              setPhase('error')
              setHeadline('לא ניתן לטעון את נתוני ההחתמה')
              return
            }
            await cacheWorkerAttendanceBootstrap(token, bootData)
            workerId = bootData.worker_id
            clientId = bootData.client_id
          } else {
            const profile = await getWorkerOfflineProfile(token)
            if (!profile) {
              setPhase('error')
              setHeadline('אין חיבור יציב')
              setDetail('נסו שוב עם Wi-Fi או סלולר.')
              return
            }
            workerId = profile.worker_id
            clientId = profile.client_id
            usedOfflineFallback = true
          }
        } catch {
          const profile = await getWorkerOfflineProfile(token)
          if (!profile) {
            setPhase('error')
            setHeadline('שגיאת רשת')
            setDetail('נסו שוב בעוד רגע.')
            return
          }
          workerId = profile.worker_id
          clientId = profile.client_id
          usedOfflineFallback = true
        }
      } else {
        const profile = await getWorkerOfflineProfile(token)
        if (!profile) {
          setPhase('error')
          setHeadline('פעם אחת עם אינטרנט')
          setDetail('פתחו את קישור ה-SMS כשיש קליט, ואז אפשר גם בלי רשת.')
          return
        }
        workerId = profile.worker_id
        clientId = profile.client_id
        usedOfflineFallback = true
      }

      const source = online && !usedOfflineFallback ? 'online' : 'offline'
      const recorded = await recordAttendanceScan(workerId, clientId, tagCode, source, null)

      if (!recorded.ok) {
        if (recorded.reason === 'duplicate_scan') {
          setPhase('duplicate')
          setHeadline('כבר נרשמת לפני רגע')
          setDetail('המתינו דקה, או המשיכו לעבוד.')
        } else {
          setPhase('error')
          setHeadline('המדבקה לא מוכרת')
          setDetail('פנו למנהל לבדוק שהמדבקה מותקנת במערכת.')
        }
        return
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([80, 40, 80])
        } catch {
          /* ignore */
        }
      }

      const eventType = recorded.event_type
      setPhase('done')
      setHeadline(EVENT_HEADLINE[eventType] ?? 'נרשם')
      setTagLabel(recorded.tag.label || recorded.tag.tag_code)
      setDetail('')

      if (online) {
        void syncPendingAttendanceEvents(token)
          .then((sync) => {
            const last = sync.results[sync.results.length - 1]
            if (last?.status === 'pending_review') {
              setDetail('נשמר — ממתין לאישור משרד')
            } else if (last?.status === 'conflict' || last?.status === 'rejected') {
              setDetail('נשמר — המשרד יבדוק')
            }
          })
          .catch(() => {
            setDetail('נשמר במכשיר — יסתנכרן כשהרשת תחזור')
          })
      } else {
        setDetail('נשמר במכשיר — יסתנכרן כשהרשת תחזור')
      }
    })()
  }, [searchParams, online])

  const isSuccess = phase === 'done'
  const icon =
    phase === 'error' || phase === 'need_bind' ? '✕' : phase === 'duplicate' ? '⏱' : isSuccess ? '✓' : null

  return (
    <div style={shell} dir="rtl">
      <div style={box}>
        {phase === 'loading' ? (
          <>
            <LoadingSpinner />
            <p style={sub}>רושם משמרת…</p>
          </>
        ) : (
          <>
            {icon ? (
              <div
                style={{
                  ...bigIcon,
                  background:
                    phase === 'error' || phase === 'need_bind'
                      ? theme.colors.errorMuted
                      : phase === 'duplicate'
                        ? theme.colors.warningMuted
                        : theme.colors.successMuted,
                  color:
                    phase === 'error' || phase === 'need_bind'
                      ? theme.colors.error
                      : phase === 'duplicate'
                        ? theme.colors.warning
                        : theme.colors.success,
                }}
              >
                {icon}
              </div>
            ) : null}
            <h1 style={title}>{headline}</h1>
            {tagLabel && isSuccess ? <p style={msg}>{tagLabel}</p> : null}
            {detail ? <p style={sub}>{detail}</p> : null}
            {isSuccess ? (
              <p style={hint}>אפשר לסגור את המסך. ביציאה — הצמידו שוב למדבקה.</p>
            ) : null}
            {phase === 'need_bind' ? (
              <div style={actions}>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    window.location.href = '/worker-login'
                  }}
                >
                  לפתיחת הקישור מה-SMS
                </Button>
                <p style={sub}>אחרי הפתיחה — חזרו למדבקה והצמידו שוב.</p>
              </div>
            ) : null}
            {phase === 'error' || phase === 'duplicate' ? (
              <p style={hint}>הצמידו שוב למדבקה אחרי תיקון הבעיה.</p>
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
  gap: 14,
}

const bigIcon: CSSProperties = {
  width: 104,
  height: 104,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 48,
  fontWeight: 700,
  marginBottom: 4,
}

const title: CSSProperties = {
  margin: 0,
  fontSize: 32,
  fontWeight: 800,
  color: theme.colors.textPrimary,
  lineHeight: 1.25,
}

const msg: CSSProperties = {
  margin: 0,
  fontSize: 20,
  lineHeight: 1.45,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const sub: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.5,
  color: theme.colors.textMuted,
}

const hint: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 15,
  lineHeight: 1.45,
  color: theme.colors.textMuted,
}

const actions: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  marginTop: 8,
  width: '100%',
}
