'use client'

/**
 * Dashboard — today's calendar only (maintenance list lives on /tasks).
 */
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import {
  CALENDAR_EVENT_TYPE_COLORS,
  CALENDAR_EVENT_TYPE_LABELS,
  type CalendarEventType,
} from '@/lib/calendar-utils'
import { Button, Card, theme } from '@/app/components/ui'

type CalEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  event_type: string
  project_name?: string | null
}

const EVENT_LIMIT = 6

function localDayBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

function formatTimeHe(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MorningOpsBoard() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { from, to } = localDayBounds()
        const calRes = await fetchWithTimeout(
          `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { method: 'GET' }
        )
        if (cancelled) return
        if (calRes?.ok) {
          const body = (await calRes.json()) as { events?: CalEvent[] }
          setEvents((body.events || []).slice(0, EVENT_LIMIT))
        } else {
          setEvents([])
        }
      } catch {
        if (!cancelled) setEvents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={styles.wrap}>
      <Card
        title="היום בלוח השנה"
        subtitle="אירועי משרד להיום"
        actions={
          <Link href="/calendar" style={styles.link}>
            ללוח שנה
          </Link>
        }
      >
        {loading ? (
          <p style={styles.muted}>טוען לוח שנה…</p>
        ) : events.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.muted}>אין אירועים היום. משימות עם תאריך יעד מסתנכרנות ללוח השנה אוטומטית.</p>
            <Button variant="secondary" onClick={() => { window.location.href = '/calendar' }}>
              פתיחת לוח שנה
            </Button>
          </div>
        ) : (
          <ul style={styles.list}>
            {events.map((ev) => {
              const et = (ev.event_type || 'other') as CalendarEventType
              const color = CALENDAR_EVENT_TYPE_COLORS[et] || CALENDAR_EVENT_TYPE_COLORS.other
              const label = CALENDAR_EVENT_TYPE_LABELS[et] || ev.event_type
              return (
                <li key={ev.id}>
                  <Link
                    href={et === 'maintenance' ? '/tasks' : '/calendar'}
                    style={styles.row}
                  >
                    <span style={{ ...styles.dot, background: color }} />
                    <span style={styles.rowBody}>
                      <span style={styles.rowTitle}>{ev.title}</span>
                      <span style={styles.rowMeta}>
                        {formatTimeHe(ev.starts_at)}
                        {` · ${label}`}
                        {ev.project_name ? ` · ${ev.project_name}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginBottom: 8,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 4px',
    textDecoration: 'none',
    borderBottom: `1px solid ${theme.colors.divider}`,
    color: 'inherit',
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary },
  rowMeta: { fontSize: 12, color: theme.colors.textMuted },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
    flexShrink: 0,
    display: 'inline-block',
  },
  link: { color: theme.colors.primary, fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  muted: { fontSize: 13, color: theme.colors.textMuted, margin: 0 },
  empty: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', padding: '4px 0 8px' },
}
