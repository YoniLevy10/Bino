'use client'

/**
 * Worker NFC stamp — tap sticker → auto clock in/out.
 * Local-first: warm IndexedDB stamps immediately; bootstrap+sync in background.
 * No GPS prompt, no redirect into the tickets portal.
 * One-time SMS link required to bind this phone (OS/browser limit).
 */

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { normalizeWorkerToken, readWorkerToken, writeWorkerToken } from '@/lib/worker-portal-storage'
import { initOfflineAttendanceDB } from '@/lib/offline-attendance-db'
import { executeNfcStampFlow, type NfcStampPhase } from '@/lib/nfc-stamp-flow'
import { syncPendingAttendanceEvents } from '@/lib/sync-attendance'
import { normalizeTagCode } from '@/lib/nfc-tag-utils'

type ScanPhase = 'loading' | NfcStampPhase

function NfcScanInner() {
  const searchParams = useSearchParams()
  const online = useOnlineStatus()
  const [phase, setPhase] = useState<ScanPhase>('loading')
  const [headline, setHeadline] = useState('')
  const [detail, setDetail] = useState('')
  const [tagLabel, setTagLabel] = useState('')
  const ranForKey = useRef<string | null>(null)

  // Stamp once per sticker URL — do not re-stamp when connectivity flips.
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

      const runKey = `${token}|${tagCode}`
      if (ranForKey.current === runKey) return
      ranForKey.current = runKey

      if (fromUrl) {
        writeWorkerToken(token)
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          window.history.replaceState(null, '', `${url.pathname}${url.search}`)
        } catch {
          /* ignore */
        }
      }

      await initOfflineAttendanceDB()

      const isOnline =
        typeof navigator !== 'undefined' ? navigator.onLine : online

      const outcome = await executeNfcStampFlow({
        token,
        tagCode,
        online: isOnline,
        onSyncDetail: (nextDetail) => setDetail(nextDetail),
      })

      if (outcome.phase === 'done' && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([80, 40, 80])
        } catch {
          /* ignore */
        }
      }

      setPhase(outcome.phase)
      setHeadline(outcome.headline)
      setDetail(outcome.detail)
      setTagLabel(outcome.tagLabel ?? '')
    })()
    // Intentionally omit `online` — connectivity flips must not re-stamp.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stamp once per sticker URL
  }, [searchParams])

  // When reception returns, flush any punches saved on the device.
  useEffect(() => {
    if (!online) return
    const token = readWorkerToken()
    if (!token) return
    void syncPendingAttendanceEvents(token).catch(() => {
      /* retry next online */
    })
  }, [online])

  const isSuccess = phase === 'done'
  const icon = phase === 'error' || phase === 'need_bind' ? '✕' : isSuccess ? '✓' : null

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
                      : theme.colors.successMuted,
                  color:
                    phase === 'error' || phase === 'need_bind'
                      ? theme.colors.error
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
            {phase === 'error' ? (
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
