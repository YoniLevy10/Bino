'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { formatAttendanceDateTime } from '@/lib/attendance-display'
import { Card, theme } from '../ui'

type LiveRow = {
  worker_id: string
  started_at: string
  workers?: { full_name?: string } | { full_name?: string }[] | null
}

type Props = {
  workers?: LiveRow[] | null
  loading?: boolean
}

export function AttendanceLiveWorkers({ workers: externalWorkers, loading: externalLoading }: Props = {}) {
  const [rows, setRows] = useState<LiveRow[]>(externalWorkers ?? [])
  const [loading, setLoading] = useState(externalWorkers === undefined && externalLoading !== false)

  useEffect(() => {
    if (externalWorkers !== undefined) {
      setRows(externalWorkers ?? [])
      setLoading(externalLoading ?? false)
      return
    }
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/attendance/live-workers')
        if (res.ok) {
          const body = (await res.json()) as { workers?: LiveRow[] }
          setRows(body.workers ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [externalWorkers, externalLoading])

  if (loading || rows.length === 0) return null

  const nameOf = (r: (typeof rows)[0]) => {
    const w = r.workers
    if (!w) return '—'
    if (Array.isArray(w)) return w[0]?.full_name ?? '—'
    return w.full_name ?? '—'
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={styles.title}>מי בשטח עכשיו?</h3>
      <ul style={styles.list}>
        {rows.map((r) => (
          <li key={r.worker_id}>
            <strong>{nameOf(r)}</strong>
            <span style={styles.sub}> · מאז {formatAttendanceDateTime(r.started_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: '0 0 10px', fontSize: 16, fontWeight: 600 },
  list: { margin: 0, paddingRight: 18, fontSize: 14, lineHeight: 1.6 },
  sub: { fontSize: 12, color: theme.colors.textMuted },
}
