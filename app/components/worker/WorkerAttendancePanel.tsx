'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { LocalAttendanceState } from '@/lib/attendance-types'
import {
  formatAttendanceDateTime,
  formatShiftMinutes,
  SHIFT_STATUS_HE,
} from '@/lib/attendance-display'
import {
  getLocalAttendanceState,
  getPendingAttendanceEvents,
  getWorkerOfflineProfile,
  initOfflineAttendanceDB,
} from '@/lib/offline-attendance-db'
import { fetchAndCacheWorkerAttendanceBootstrap } from '@/lib/worker-attendance-bootstrap'
import { syncPendingAttendanceEvents } from '@/lib/sync-attendance'

type ShiftRow = {
  id: string
  started_at: string
  ended_at: string | null
  total_minutes: number | null
  status: string
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
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const refreshLocal = useCallback(async () => {
    await initOfflineAttendanceDB()
    const profile = await getWorkerOfflineProfile(token)
    setReady(!!profile)
    const pending = await getPendingAttendanceEvents()
    setPendingCount(pending.length)
    const st = await getLocalAttendanceState(workerId)
    setState(st)
  }, [token, workerId])

  const loadShifts = useCallback(async () => {
    if (!online || !token) return
    setShiftsLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/worker/attendance/shifts?token=${encodeURIComponent(token)}&limit=30`
      )
      if (res.ok) {
        const body = (await res.json()) as { shifts?: ShiftRow[] }
        setShifts(body.shifts ?? [])
      }
    } finally {
      setShiftsLoading(false)
    }
  }, [online, token])

  useEffect(() => {
    void refreshLocal()
  }, [refreshLocal])

  useEffect(() => {
    if (!online || !token) return
    void (async () => {
      try {
        await fetchAndCacheWorkerAttendanceBootstrap(token)
        await refreshLocal()
        await loadShifts()
      } catch {
        /* ignore */
      }
    })()
  }, [online, token, refreshLocal, loadShifts])

  useEffect(() => {
    if (!online || !token) return
    void syncPendingAttendanceEvents(token).then(async () => {
      await refreshLocal()
      await loadShifts()
    })
  }, [online, token, refreshLocal, loadShifts])

  const handleSync = async () => {
    if (!online) return
    setSyncing(true)
    try {
      await syncPendingAttendanceEvents(token)
      await fetchAndCacheWorkerAttendanceBootstrap(token)
      await refreshLocal()
      await loadShifts()
    } finally {
      setSyncing(false)
    }
  }

  const inShift = state?.has_open_shift

  const { todayMinutes, weekMinutes } = useMemo(() => {
    const nowDate = new Date()
    const dayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate())
    const weekStart = new Date(dayStart)
    weekStart.setDate(weekStart.getDate() - 6)
    let today = 0
    let week = 0
    for (const s of shifts) {
      if (!s.total_minutes) continue
      const started = new Date(s.started_at)
      if (started >= dayStart) today += s.total_minutes
      if (started >= weekStart) week += s.total_minutes
    }
    return { todayMinutes: today, weekMinutes: week }
  }, [shifts])

  return (
    <div style={styles.wrap}>
      <div style={styles.hero(colors, inShift)}>
        <div style={styles.heroTitle(colors)}>
          {inShift ? 'את/ה בעבודה עכשיו' : 'לא רשום/ה בעבודה'}
        </div>
        <p style={styles.heroHint(colors)}>
          {inShift
            ? 'ביציאה — הצמידו שוב את הטלפון למדבקה.'
            : 'בכניסה — הצמידו את הטלפון למדבקה בדלת.'}
        </p>
      </div>

      <div style={styles.card(colors)}>
        <div style={styles.instructionTitle(colors)}>מה עושים?</div>
        <ol style={styles.steps(colors)}>
          <li>מצמידים את הטלפון למדבקה בכניסה למשרד או לבניין</li>
          <li>מחכים שנייה — יופיע אישור על המסך</li>
          <li>בסוף היום — שוב מדבקה ביציאה</li>
        </ol>
        {!ready && online ? (
          <p style={styles.warn(colors)}>פעם ראשונה? ודאו שיש אינטרנט — זה נדרש רק פעם אחת.</p>
        ) : null}
        {!online ? (
          <p style={styles.warn(colors)}>אין אינטרנט — ההחתמה נשמרת ותעלה כשיחזור קליט.</p>
        ) : null}
        {pendingCount > 0 ? (
          <p style={styles.pending(colors)}>
            {pendingCount} החתמות ממתינות לשליחה — {online ? 'שולח...' : 'ישלחו כשיחזור אינטרנט'}
          </p>
        ) : null}
      </div>

      <div style={styles.statsRow(colors)}>
        <div style={styles.statBox(colors)}>
          <div style={styles.statLabel(colors)}>היום</div>
          <div style={styles.statValue(colors)}>{formatShiftMinutes(todayMinutes)}</div>
        </div>
        <div style={styles.statBox(colors)}>
          <div style={styles.statLabel(colors)}>7 ימים</div>
          <div style={styles.statValue(colors)}>{formatShiftMinutes(weekMinutes)}</div>
        </div>
      </div>

      <div style={styles.card(colors)}>
        <div style={styles.sectionHead}>
          <div style={styles.sectionTitle(colors)}>המשמרות שלי</div>
          {online ? (
            <Button variant="secondary" size="sm" loading={syncing} onClick={() => void handleSync()}>
              רענון
            </Button>
          ) : null}
        </div>

        {shiftsLoading && shifts.length === 0 ? (
          <p style={styles.muted(colors)}>טוען...</p>
        ) : shifts.length === 0 ? (
          <p style={styles.muted(colors)}>עדיין אין משמרות — אחרי ההחתמה הראשונה יופיעו כאן.</p>
        ) : (
          <ul style={styles.shiftList}>
            {shifts.map((s) => (
              <li key={s.id} style={styles.shiftItem(colors)}>
                <div style={styles.shiftDate(colors)}>{formatAttendanceDateTime(s.started_at)}</div>
                <div style={styles.shiftMeta(colors)}>
                  {s.ended_at ? (
                    <>
                      יציאה: {formatAttendanceDateTime(s.ended_at)}
                      {' · '}
                      {formatShiftMinutes(s.total_minutes)}
                    </>
                  ) : (
                    SHIFT_STATUS_HE[s.status] ?? 'בעבודה'
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { padding: '0 0 24px' } as CSSProperties,
  hero: (c: typeof theme.colors, active: boolean | undefined): CSSProperties => ({
    margin: '12px 16px',
    padding: '20px 18px',
    borderRadius: 14,
    background: active ? c.successMuted : c.surface,
    border: `2px solid ${active ? c.success : c.border}`,
    textAlign: 'center',
  }),
  heroTitle: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 22,
    fontWeight: 800,
    color: c.textPrimary,
    marginBottom: 6,
  }),
  heroHint: (c: typeof theme.colors): CSSProperties => ({
    margin: 0,
    fontSize: 15,
    lineHeight: 1.45,
    color: c.textPrimary,
  }),
  card: (c: typeof theme.colors): CSSProperties => ({
    margin: '12px 16px',
    padding: 16,
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    background: c.surface,
  }),
  instructionTitle: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 10,
    color: c.textPrimary,
  }),
  steps: (c: typeof theme.colors): CSSProperties => ({
    margin: '0 0 12px',
    paddingRight: 20,
    fontSize: 15,
    lineHeight: 1.6,
    color: c.textPrimary,
  }),
  warn: (c: typeof theme.colors): CSSProperties => ({
    margin: '8px 0 0',
    fontSize: 13,
    color: c.warning,
    lineHeight: 1.45,
  }),
  pending: (c: typeof theme.colors): CSSProperties => ({
    margin: '8px 0 0',
    fontSize: 13,
    color: c.primary,
  }),
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  } as CSSProperties,
  sectionTitle: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 700,
    fontSize: 16,
    color: c.textPrimary,
  }),
  muted: (c: typeof theme.colors): CSSProperties => ({
    margin: 0,
    fontSize: 14,
    color: c.textMuted,
    lineHeight: 1.45,
  }),
  shiftList: { margin: 0, padding: 0, listStyle: 'none' } as CSSProperties,
  shiftItem: (c: typeof theme.colors): CSSProperties => ({
    padding: '12px 0',
    borderBottom: `1px solid ${c.border}`,
  }),
  shiftDate: (c: typeof theme.colors): CSSProperties => ({
    fontWeight: 600,
    fontSize: 14,
    color: c.textPrimary,
    marginBottom: 4,
  }),
  shiftMeta: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 13,
    color: c.textMuted,
  }),
  statsRow: (c: typeof theme.colors): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    margin: '12px 16px',
  }),
  statBox: (c: typeof theme.colors): CSSProperties => ({
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    background: c.surface,
    textAlign: 'center',
  }),
  statLabel: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 13,
    color: c.textMuted,
    marginBottom: 4,
  }),
  statValue: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 20,
    fontWeight: 800,
    color: c.primary,
  }),
}
