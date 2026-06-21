'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { formatAttendanceDateTime, EVENT_TYPE_HE } from '@/lib/attendance-display'
import { Card, theme } from '../ui'

type EventRow = {
  id: string
  event_type: string
  client_recorded_at: string
  sync_status?: string
  suspicious_reason?: string | null
  workers?: { full_name?: string } | { full_name?: string }[] | null
}

type ShiftRow = {
  id: string
  started_at: string
  workers?: { full_name?: string } | { full_name?: string }[] | null
}

function nameOf(w: EventRow['workers']): string {
  if (!w) return '—'
  if (Array.isArray(w)) return w[0]?.full_name ?? '—'
  return w.full_name ?? '—'
}

export function AttendanceAnomalies() {
  const [pending, setPending] = useState<EventRow[]>([])
  const [missing, setMissing] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/attendance/anomalies')
        if (res.ok) {
          const body = (await res.json()) as {
            pending_review?: EventRow[]
            missing_checkout?: ShiftRow[]
          }
          setPending(body.pending_review ?? [])
          setMissing(body.missing_checkout ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return null
  if (pending.length === 0 && missing.length === 0) return null

  return (
    <Card style={{ marginBottom: 16, borderColor: theme.colors.warning }}>
      <h3 style={styles.title}>דברים שדורשים תשומת לב</h3>
      {missing.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>חסרה יציאה</div>
          <ul style={styles.list}>
            {missing.map((m) => (
              <li key={m.id}>
                {nameOf(m.workers)} · נכנס/ה {formatAttendanceDateTime(m.started_at)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {pending.length > 0 ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>ממתין לאישור ({pending.length})</div>
          <ul style={styles.list}>
            {pending.slice(0, 8).map((e) => (
              <li key={e.id}>
                {nameOf(e.workers)} · {EVENT_TYPE_HE[e.event_type] ?? e.event_type} ·{' '}
                {formatAttendanceDateTime(e.client_recorded_at)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  section: { marginBottom: 12 },
  sectionTitle: { fontWeight: 600, fontSize: 14, marginBottom: 6 },
  list: { margin: 0, paddingRight: 18, fontSize: 13, lineHeight: 1.5 },
}
