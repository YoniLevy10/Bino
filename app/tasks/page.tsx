'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AppShell, Button, Card, LoadingSpinner, PageHeader, theme } from '../components/ui'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { supabase } from '@/lib/supabase'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { getIsMobileViewport } from '@/lib/mobile-viewport'

type TaskRow = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  notes: string | null
  project_id: string | null
  assigned_worker_id: string | null
  projects?: { name?: string | null; address?: string | null } | { name?: string | null; address?: string | null }[] | null
  workers?: { full_name?: string | null } | { full_name?: string | null }[] | null
}

type WorkerOpt = { id: string; full_name: string }
type ProjectOpt = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ממתינה',
  IN_PROGRESS: 'בביצוע',
  DONE: 'הושלמה',
}

function relName(row: TaskRow): string {
  const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
  return w?.full_name || 'לא משויך'
}

function projectName(row: TaskRow): string {
  const p = Array.isArray(row.projects) ? row.projects[0] : row.projects
  return p?.name || 'ללא בניין'
}

export default function TasksPage() {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [workers, setWorkers] = useState<WorkerOpt[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueAt, setDueAt] = useState('')
  const [dayOnly, setDayOnly] = useState(true)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const clientId = await resolveBinoClientIdForBrowser()
      const [tasksRes, workersRes, projectsRes] = await Promise.all([
        fetchWithTimeout('/api/maintenance-tasks'),
        clientId
          ? supabase
              .from('workers')
              .select('id, full_name')
              .eq('client_id', clientId)
              .eq('is_active', true)
              .is('deleted_at', null)
              .order('full_name')
          : Promise.resolve({ data: [] as WorkerOpt[] }),
        clientId
          ? supabase
              .from('projects')
              .select('id, name')
              .eq('client_id', clientId)
              .is('deleted_at', null)
              .order('name')
          : Promise.resolve({ data: [] as ProjectOpt[] }),
      ])
      if (!tasksRes.ok) {
        toast.error('טעינת משימות נכשלה')
        return
      }
      const json = (await tasksRes.json()) as { tasks?: TaskRow[] }
      setTasks(json.tasks || [])
      setWorkers((workersRes.data as WorkerOpt[]) || [])
      setProjects((projectsRes.data as ProjectOpt[]) || [])
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    if (!dayOnly) return tasks
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    return tasks.filter((t) => {
      if (!t.due_at) return t.status !== 'DONE'
      const d = new Date(t.due_at).getTime()
      return d >= start.getTime() && d <= end.getTime()
    })
  }, [tasks, dayOnly])

  async function createTask() {
    if (!title.trim()) {
      toast.error('נא למלא כותרת')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            project_id: projectId || null,
            assigned_worker_id: workerId || null,
            priority,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'יצירה נכשלה')
        return
      }
      toast.success('המשימה נוצרה')
      setTitle('')
      setDescription('')
      setProjectId('')
      setWorkerId('')
      setDueAt('')
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSaving(false)
    }
  }

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, ...body }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('עדכון נכשל')
        return
      }
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  return (
    <AppShell>
      <PageHeader title="ניהול משימות" subtitle="משימות אחזקה נפרדות ממערכת התקלות" />
      <div style={styles.wrap(isMobile)}>
        <Card>
          <div style={styles.formGrid(isMobile)}>
            <input
              style={styles.input}
              placeholder="כותרת משימה"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              style={styles.textarea}
              placeholder="תיאור"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <select style={styles.input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">ללא בניין</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select style={styles.input} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">ללא עובד</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name}
                </option>
              ))}
            </select>
            <select style={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="LOW">נמוכה</option>
              <option value="MEDIUM">בינונית</option>
              <option value="HIGH">גבוהה</option>
              <option value="URGENT">דחופה</option>
            </select>
            <input
              type="datetime-local"
              style={styles.input}
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
            <Button type="button" onClick={() => void createTask()} disabled={saving}>
              {saving ? 'שומר…' : 'צור משימה'}
            </Button>
          </div>
        </Card>

        <div style={styles.toolbar}>
          <label style={styles.check}>
            <input type="checkbox" checked={dayOnly} onChange={(e) => setDayOnly(e.target.checked)} />
            משימות היום / פתוחות ללא תאריך
          </label>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            רענון
          </Button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : visible.length === 0 ? (
          <p style={styles.empty}>אין משימות להצגה</p>
        ) : (
          <div style={styles.list}>
            {visible.map((t) => (
              <Card key={t.id}>
                <div style={styles.taskHead}>
                  <strong>{t.title}</strong>
                  <span style={styles.badge}>{STATUS_LABEL[t.status] || t.status}</span>
                </div>
                <div style={styles.meta}>
                  {projectName(t)} · {relName(t)}
                  {t.due_at ? ` · ${new Date(t.due_at).toLocaleString('he-IL')}` : ''}
                </div>
                {t.description ? <p style={styles.desc}>{t.description}</p> : null}
                <div style={styles.actions}>
                  <select
                    style={styles.input}
                    value={t.assigned_worker_id || ''}
                    onChange={(e) =>
                      void patchTask(t.id, { assigned_worker_id: e.target.value || null })
                    }
                  >
                    <option value="">העבר לעובד…</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.full_name}
                      </option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={t.status}
                    onChange={(e) => void patchTask(t.id, { status: e.target.value })}
                  >
                    <option value="PENDING">ממתינה</option>
                    <option value="IN_PROGRESS">בביצוע</option>
                    <option value="DONE">הושלמה</option>
                  </select>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? 12 : 20,
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }),
  formGrid: (mobile: boolean): CSSProperties => ({
    display: 'grid',
    gap: 10,
    gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
  }),
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    gridColumn: '1 / -1',
    boxSizing: 'border-box' as const,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  taskHead: { display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    padding: '4px 8px',
    borderRadius: 8,
  },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  desc: { fontSize: 14, margin: '0 0 10px', lineHeight: 1.45 },
  actions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  empty: { textAlign: 'center' as const, color: theme.colors.textSecondary },
}
