'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, LoadingSpinner, type theme } from '../ui'

export type WorkerTourProject = {
  id: string
  name: string
  address: string | null
  project_code: string | null
}

export type WorkerTourLog = {
  id: string
  project_id: string
  project_name: string
  completed_at: string
  notes: string | null
}

type WorkerToursPanelProps = {
  token: string
  colors: typeof theme.colors
  refreshKey?: number
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTourTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WorkerToursPanel({ token, colors, refreshKey = 0 }: WorkerToursPanelProps) {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<WorkerTourProject[]>([])
  const [tours, setTours] = useState<WorkerTourLog[]>([])
  const [search, setSearch] = useState('')
  const [timesByProject, setTimesByProject] = useState<Record<string, string>>({})
  const [loggingId, setLoggingId] = useState<string | null>(null)

  const loadTours = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const res = await fetchWithTimeout(`/api/worker/tours?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        toast.error('טעינת סיורים נכשלה')
        return
      }
      const data = (await res.json()) as { projects?: WorkerTourProject[]; tours?: WorkerTourLog[] }
      setProjects(data.projects || [])
      setTours(data.tours || [])
    } catch {
      toast.error('טעינת סיורים נכשלה')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadTours()
  }, [loadTours])

  useEffect(() => {
    if (refreshKey > 0) void loadTours({ silent: true })
  }, [refreshKey, loadTours])

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.project_code || '').toLowerCase().includes(q)
    )
  }, [projects, search])

  function projectTime(projectId: string): string {
    return timesByProject[projectId] ?? toDatetimeLocalValue(new Date())
  }

  async function logTour(project: WorkerTourProject) {
    setLoggingId(project.id)
    try {
      const local = projectTime(project.id)
      const completedAt = new Date(local)
      const res = await fetchWithTimeout('/api/worker/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          project_id: project.id,
          completed_at: completedAt.toISOString(),
        }),
      })
      const data = (await res.json()) as { error?: string; tour?: WorkerTourLog }
      if (!res.ok) {
        toast.error(data.error || 'רישום הסיור נכשל')
        return
      }
      if (data.tour) {
        setTours((prev) => [data.tour!, ...prev.filter((t) => t.id !== data.tour!.id)])
      }
      setTimesByProject((prev) => ({ ...prev, [project.id]: toDatetimeLocalValue(new Date()) }))
      toast.success(`סיור ב${project.name} נרשם`)
    } catch {
      toast.error('רישום הסיור נכשל')
    } finally {
      setLoggingId(null)
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <p style={{ ...styles.hint, color: colors.textMuted }}>
        בחרו פרויקט, הגדירו שעת הסיור ולחצו &quot;רשמתי סיור&quot; — בלי לפתוח תקלה.
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש פרויקט…"
        style={{
          ...styles.search,
          borderColor: colors.border,
          background: colors.surface,
          color: colors.textPrimary,
        }}
      />

      {filteredProjects.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ ...styles.emptyText, color: colors.textMuted }}>
            {projects.length === 0 ? 'אין פרויקטים פעילים' : 'לא נמצאו פרויקטים בחיפוש'}
          </p>
        </div>
      ) : (
        <div style={styles.projectList}>
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              style={{
                ...styles.projectCard,
                borderColor: colors.border,
                background: colors.surface,
              }}
            >
              <div style={styles.projectHead}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'right' as const }}>
                  <div style={{ ...styles.projectName, color: colors.textPrimary }}>{p.name}</div>
                  {p.address ? (
                    <div style={{ ...styles.projectAddr, color: colors.textMuted }}>{p.address}</div>
                  ) : null}
                </div>
              </div>
              <div style={styles.logRow}>
                <label style={{ ...styles.timeLabel, color: colors.textSecondary }}>
                  שעת הסיור
                  <input
                    type="datetime-local"
                    value={projectTime(p.id)}
                    onChange={(e) =>
                      setTimesByProject((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    style={{
                      ...styles.timeInput,
                      borderColor: colors.border,
                      background: colors.muted,
                      color: colors.textPrimary,
                    }}
                  />
                </label>
                <Button
                  variant="primary"
                  size="sm"
                  loading={loggingId === p.id}
                  onClick={() => void logTour(p)}
                >
                  רשמתי סיור
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tours.length > 0 ? (
        <div style={styles.recent}>
          <h2 style={{ ...styles.recentTitle, color: colors.textPrimary }}>סיורים אחרונים</h2>
          <div style={styles.tourList}>
            {tours.map((t) => (
              <div
                key={t.id}
                style={{
                  ...styles.tourRow,
                  borderColor: colors.borderSubtle,
                  background: colors.muted,
                }}
              >
                <div style={{ ...styles.tourName, color: colors.textPrimary }}>{t.project_name}</div>
                <div style={{ ...styles.tourTime, color: colors.textMuted }}>{formatTourTime(t.completed_at)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '12px' },
  center: { padding: '40px', display: 'flex', justifyContent: 'center' },
  hint: { fontSize: '13px', lineHeight: 1.45, margin: 0 },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    fontSize: '16px',
    borderRadius: '10px',
    border: '1.5px solid',
  },
  empty: { padding: '24px 8px', textAlign: 'center' },
  emptyText: { fontSize: '14px', margin: 0 },
  projectList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  projectCard: {
    borderRadius: '12px',
    border: '1.5px solid',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  projectHead: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  projectName: { fontSize: '15px', fontWeight: 700, lineHeight: 1.3 },
  projectAddr: { fontSize: '12px', marginTop: '4px', lineHeight: 1.35 },
  logRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '10px',
    justifyContent: 'space-between',
  },
  timeLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    fontWeight: 600,
    flex: '1 1 160px',
  },
  timeInput: {
    padding: '10px 12px',
    fontSize: '15px',
    borderRadius: '8px',
    border: '1px solid',
    fontFamily: 'inherit',
  },
  recent: { marginTop: '8px' },
  recentTitle: { fontSize: '15px', fontWeight: 700, margin: '0 0 10px' },
  tourList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  tourRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid',
  },
  tourName: { fontSize: '14px', fontWeight: 600 },
  tourTime: { fontSize: '12px', flexShrink: 0 },
}
