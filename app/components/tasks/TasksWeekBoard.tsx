'use client'

/**
 * Combined week grid: calendar events + maintenance tasks by due_at.
 * Drag a task card onto another day to PATCH due_at.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import Link from 'next/link'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/shared/fetch-with-timeout'
import { toast } from '@/lib/errors/error-handler'
import { weekRangeIso, dateKeyLocal } from '@/lib/calendar-utils'
import { cadenceColor, cadenceLabel } from '@/lib/maintenance/maintenance-cadence'
import { Button, theme } from '@/app/components/ui'

type WeekTask = {
  id: string
  title: string
  due_at: string | null
  status: string
  cadence?: string | null
}

type WeekEvent = {
  id: string
  title: string
  starts_at: string
  event_type: string
}

type Props = {
  anchor?: Date
  onChanged?: () => void
}

function startOfWeekSunday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay())
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function TasksWeekBoard({ anchor, onChanged }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekSunday(anchor || new Date()))
  const [tasks, setTasks] = useState<WeekTask[]>([])
  const [events, setEvents] = useState<WeekEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const { from, to } = useMemo(
    () => weekRangeIso(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
    [weekStart]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, eRes] = await Promise.all([
        fetchWithTimeout(
          `/api/maintenance-tasks?limit=80&filter=open&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        ),
        fetchWithTimeout(
          `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        ),
      ])
      if (tRes.ok) {
        const j = (await tRes.json()) as { tasks?: WeekTask[] }
        setTasks(
          (j.tasks || []).filter((t) => {
            if (!t.due_at) return false
            const k = t.due_at
            return k >= from && k < to
          })
        )
      }
      if (eRes.ok) {
        const j = (await eRes.json()) as { events?: WeekEvent[] }
        setEvents(j.events || [])
      }
    } catch {
      toast.error('טעינת שבוע נכשלה')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  async function moveTaskDue(taskId: string, day: Date) {
    const task = tasks.find((t) => t.id === taskId)
    const prev = task?.due_at ? new Date(task.due_at) : new Date()
    const next = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      prev.getHours(),
      prev.getMinutes(),
      0,
      0
    )
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            due_at: next.toISOString(),
            sync_to_calendar: true,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('עדכון תאריך נכשל')
        return
      }
      toast.success('תאריך היעד עודכן')
      await load()
      onChanged?.()
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  function onDragStart(e: DragEvent, taskId: string) {
    setDraggingId(taskId)
    e.dataTransfer.setData('text/task-id', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDropDay(e: DragEvent, day: Date) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/task-id') || draggingId
    setDraggingId(null)
    if (id) void moveTaskDue(id, day)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          שבוע קודם
        </Button>
        <span style={styles.rangeLabel}>
          {weekStart.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
          {' – '}
          {addDays(weekStart, 6).toLocaleDateString('he-IL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
        >
          שבוע הבא
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeekSunday(new Date()))}>
          השבוע
        </Button>
      </div>
      {loading ? (
        <p style={styles.muted}>טוען שבוע…</p>
      ) : (
        <div style={styles.grid}>
          {days.map((day) => {
            const key = dateKeyLocal(day)
            const dayTasks = tasks.filter((t) => t.due_at && dateKeyLocal(new Date(t.due_at)) === key)
            const dayEvents = events.filter((ev) => dateKeyLocal(new Date(ev.starts_at)) === key)
            return (
              <div
                key={key}
                style={styles.col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropDay(e, day)}
              >
                <div style={styles.colHead}>
                  {day.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric' })}
                </div>
                {dayEvents.map((ev) => (
                  <Link key={ev.id} href="/calendar" style={styles.eventChip}>
                    {ev.title}
                  </Link>
                ))}
                {dayTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    style={{
                      ...styles.taskChip,
                      borderInlineStart: `3px solid ${cadenceColor(t.cadence)}`,
                      opacity: draggingId === t.id ? 0.5 : 1,
                    }}
                    title={cadenceLabel(t.cadence)}
                  >
                    <Link href="/tasks" style={styles.taskLink}>
                      {t.title}
                    </Link>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rangeLabel: { fontWeight: 700, fontSize: 14, color: theme.colors.textPrimary },
  muted: { color: theme.colors.textSecondary, fontSize: 13 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: 8,
    minWidth: 0,
    overflowX: 'auto',
  },
  col: {
    minHeight: 140,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 12,
    padding: 8,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  colHead: {
    fontSize: 12,
    fontWeight: 800,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  eventChip: {
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 8,
    background: theme.colors.mutedSurface,
    color: theme.colors.textPrimary,
    textDecoration: 'none',
  },
  taskChip: {
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 8,
    background: theme.colors.primaryMuted,
    cursor: 'grab',
  },
  taskLink: {
    color: theme.colors.textPrimary,
    textDecoration: 'none',
    fontWeight: 700,
  },
}
