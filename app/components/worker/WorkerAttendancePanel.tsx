'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import type { LocalAttendanceState } from '@/lib/attendance-types'
import {
  getLocalAttendanceState,
  getPendingAttendanceEvents,
  getWorkerOfflineProfile,
  initOfflineAttendanceDB,
} from '@/lib/offline-attendance-db'
import { fetchAndCacheWorkerAttendanceBootstrap } from '@/lib/worker-attendance-bootstrap'
import { syncPendingAttendanceEvents } from '@/lib/sync-attendance'

const EVENT_LABELS: Record<string, string> = {
  clock_in: 'כניסה לעבודה',
  clock_out: 'יציאה מהעבודה',
  project_visit: 'ביקור בפרויקט',
  project_arrival: 'הגעה לפרויקט',
  project_departure: 'יציאה מפרויקט',
}

type Props = {
  token: string
  workerId: string
  colors: typeof theme.colors
}

export function WorkerAttendancePanel({ token, workerId, colors }: Props) {
  const online = useOnlineStatus()
  const [ready, setReady] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [state, setState] = useState<LocalAttendanceState | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)

  const refreshLocal = useCallback(async () => {
    await initOfflineAttendanceDB()
    const profile = await getWorkerOfflineProfile(token)
    setReady(!!profile)
    const pending = await getPendingAttendanceEvents()
    setPendingCount(pending.length)
    const st = await getLocalAttendanceState(workerId)
    setState(st)
  }, [token, workerId])

  useEffect(() => {
    void refreshLocal()
  }, [refreshLocal])

  useEffect(() => {
    if (!online || !token) return
    void (async () => {
      setBootstrapping(true)
      try {
        await fetchAndCacheWorkerAttendanceBootstrap(token)
        await refreshLocal()
      } finally {
        setBootstrapping(false)
      }
    })()
  }, [online, token, refreshLocal])

  useEffect(() => {
    if (!online || !token) return
    void syncPendingAttendanceEvents(token).then(() => refreshLocal())
  }, [online, token, refreshLocal])

  const handleSync = async () => {
    if (!online) return
    setSyncing(true)
    try {
      await syncPendingAttendanceEvents(token)
      await fetchAndCacheWorkerAttendanceBootstrap(token)
      await refreshLocal()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={styles.card(colors)}>
      {!online ? (
        <p style={styles.banner(colors)}>
          אתה במצב ללא אינטרנט. הפעולות יישמרו במכשיר ויסתנכרנו אוטומטית כשהחיבור יחזור.
        </p>
      ) : null}

      <div style={styles.statusRow}>
        <span
          style={styles.badge(
            online ? colors.successMuted : colors.warningMuted,
            online ? colors.success : colors.warning
          )}
        >
          {online ? 'מחובר' : 'לא מחובר'}
        </span>
        {pendingCount > 0 ? (
          <span style={styles.badge(colors.primaryMuted, colors.primary)}>
            {pendingCount} ממתינים לסנכרון
          </span>
        ) : null}
        {ready ? (
          <span style={styles.badge(colors.successMuted, colors.success)}>מוכן ל-Offline</span>
        ) : (
          <span style={styles.badge(colors.warningMuted, colors.warning)}>נדרשת פתיחה עם אינטרנט</span>
        )}
      </div>

      <p style={styles.hint(colors)}>
        {ready
          ? 'המכשיר מוכן לעבודה גם ללא אינטרנט.'
          : 'כדי לעבוד ללא אינטרנט, צריך לפתוח את המערכת פעם אחת כשיש חיבור.'}
      </p>

      <p style={styles.hint(colors)}>
        סריקת QR / NFC עובדת גם ללא אינטרנט לאחר פתיחת המערכת פעם אחת במכשיר.
      </p>

      <div style={styles.row}>
        <div>
          <div style={styles.label(colors)}>סטטוס משמרת</div>
          <div style={styles.value(colors)}>
            {state?.has_open_shift ? 'בתוך משמרת פתוחה' : 'לא במשמרת'}
          </div>
          {state?.last_event_type ? (
            <div style={{ ...styles.sub(colors), marginTop: 4 }}>
              פעולה אחרונה: {EVENT_LABELS[state.last_event_type] ?? state.last_event_type}
              {state.last_event_at
                ? ` · ${new Date(state.last_event_at).toLocaleString('he-IL')}`
                : ''}
            </div>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={syncing || bootstrapping}
          disabled={!online}
          onClick={() => void handleSync()}
        >
          סנכרן עכשיו
        </Button>
      </div>
    </div>
  )
}

const styles = {
  card: (c: typeof theme.colors): CSSProperties => ({
    margin: '12px 16px',
    padding: 16,
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    background: c.surface,
  }),
  banner: (c: typeof theme.colors): CSSProperties => ({
    margin: '0 0 12px',
    padding: 10,
    borderRadius: 8,
    background: c.warningMuted,
    color: c.textPrimary,
    fontSize: 14,
    lineHeight: 1.5,
  }),
  statusRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 10 },
  badge: (bg: string, text?: string): CSSProperties => ({
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    background: bg,
    color: text ?? '#fff',
    fontWeight: 600,
  }),
  hint: (c: typeof theme.colors): CSSProperties => ({
    margin: '0 0 8px',
    fontSize: 13,
    color: c.textMuted,
    lineHeight: 1.45,
  }),
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  label: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 12,
    color: c.textMuted,
  }),
  value: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 16,
    fontWeight: 600,
    color: c.textPrimary,
  }),
  sub: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 12,
    color: c.textMuted,
  }),
}
