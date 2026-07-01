'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { formatAttendanceDateTime } from '@/lib/attendance-display'
import { Card, theme } from '../ui'

type Summary = {
  active_now: { worker_id: string; full_name: string; started_at: string }[]
  clocked_in_today: { worker_id: string; full_name: string }[]
  missing_checkout: { worker_id: string; full_name: string; started_at: string }[]
}

type Props = {
  /** When set, skip self-fetch (parent loaded /api/attendance/dashboard). */
  data?: Summary | null
  loading?: boolean
}

export function AttendanceTodaySummary({ data: externalData, loading: externalLoading }: Props = {}) {
  const [data, setData] = useState<Summary | null>(externalData ?? null)
  const [loading, setLoading] = useState(externalData === undefined && externalLoading !== false)

  useEffect(() => {
    if (externalData !== undefined) {
      setData(externalData)
      setLoading(externalLoading ?? false)
      return
    }
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/attendance/today-summary')
        if (res.ok) {
          setData((await res.json()) as Summary)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [externalData, externalLoading])

  if (loading) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <p style={styles.hint}>טוען סיכום היום...</p>
      </Card>
    )
  }

  if (!data) return null

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={styles.title}>מה קורה היום?</h3>
      <div style={styles.grid}>
        <div style={styles.block}>
          <div style={styles.label}>עובדים בדרך עכשיו</div>
          {data.active_now.length === 0 ? (
            <p style={styles.empty}>אף אחד לא רשום בעבודה כרגע</p>
          ) : (
            <ul style={styles.list}>
              {data.active_now.map((w) => (
                <li key={w.worker_id}>
                  <strong>{w.full_name}</strong>
                  <span style={styles.sub}> · מאז {formatAttendanceDateTime(w.started_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={styles.block}>
          <div style={styles.label}>נכנסו היום ({data.clocked_in_today.length})</div>
          {data.clocked_in_today.length === 0 ? (
            <p style={styles.empty}>עדיין אין כניסות היום</p>
          ) : (
            <p style={styles.names}>{data.clocked_in_today.map((w) => w.full_name).join(' · ')}</p>
          )}
        </div>
        {data.missing_checkout.length > 0 ? (
          <div style={{ ...styles.block, ...styles.warnBlock }}>
            <div style={styles.label}>חסרה יציאה — צריך לבדוק</div>
            <ul style={styles.list}>
              {data.missing_checkout.map((w) => (
                <li key={w.worker_id}>
                  {w.full_name} · {formatAttendanceDateTime(w.started_at)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  hint: { margin: 0, fontSize: 13, color: theme.colors.textMuted },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  block: { padding: 12, borderRadius: 8, background: theme.colors.background, border: `1px solid ${theme.colors.border}` },
  warnBlock: { borderColor: theme.colors.warning, background: theme.colors.warningMuted },
  label: { fontWeight: 600, fontSize: 14, marginBottom: 8 },
  list: { margin: 0, paddingRight: 18, fontSize: 14, lineHeight: 1.5 },
  names: { margin: 0, fontSize: 14, lineHeight: 1.5 },
  sub: { fontSize: 12, color: theme.colors.textMuted },
  empty: { margin: 0, fontSize: 13, color: theme.colors.textMuted },
}
