'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AppShell,
  Button,
  Card,
  LoadingSpinner,
  MobileHeader,
  PageHeader,
  theme,
  useMobileMenu,
} from '../components/ui'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
  WORKER_PHOTO_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { supabase } from '@/lib/supabase'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { isMaintenanceTaskForToday } from '@/lib/maintenance-task-day'

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

type TaskAttachment = {
  id: string
  file_name: string
  public_url: string | null
  mime_type: string | null
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

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TasksPage() {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [workers, setWorkers] = useState<WorkerOpt[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueAt, setDueAt] = useState('')
  const [dayOnly, setDayOnly] = useState(true)
  const [groupByWorker, setGroupByWorker] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<TaskRow>>({})
  const [attachmentsByTask, setAttachmentsByTask] = useState<Record<string, TaskAttachment[]>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadAttachments = useCallback(async (taskId: string) => {
    try {
      const res = await fetchWithTimeout(
        `/api/maintenance-tasks/attachments?task_id=${encodeURIComponent(taskId)}`
      )
      if (!res.ok) return
      const json = (await res.json()) as { attachments?: TaskAttachment[] }
      setAttachmentsByTask((prev) => ({ ...prev, [taskId]: json.attachments || [] }))
    } catch {
      /* ignore */
    }
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
      const list = json.tasks || []
      setTasks(list)
      setWorkers((workersRes.data as WorkerOpt[]) || [])
      setProjects((projectsRes.data as ProjectOpt[]) || [])
      await Promise.all(list.slice(0, 40).map((t) => loadAttachments(t.id)))
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setLoading(false)
    }
  }, [loadAttachments])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    if (!dayOnly) return tasks
    return tasks.filter((t) =>
      isMaintenanceTaskForToday({ dueAt: t.due_at, status: t.status })
    )
  }, [tasks, dayOnly])

  const grouped = useMemo(() => {
    if (!groupByWorker) return [{ key: 'all', label: null as string | null, items: visible }]
    const map = new Map<string, { label: string; items: TaskRow[] }>()
    for (const t of visible) {
      const key = t.assigned_worker_id || 'unassigned'
      const label = relName(t)
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(t)
    }
    return Array.from(map.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      items: v.items,
    }))
  }, [visible, groupByWorker])

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
            notes: notes.trim() || null,
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
      setNotes('')
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
      setEditingId(null)
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  async function uploadPhoto(taskId: string, file: File) {
    try {
      const fd = new FormData()
      fd.append('task_id', taskId)
      fd.append('file', file)
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/attachments',
        { method: 'POST', body: fd },
        WORKER_PHOTO_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('העלאת קובץ נכשלה')
        return
      }
      toast.success('הקובץ צורף')
      await loadAttachments(taskId)
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  function startEdit(t: TaskRow) {
    setEditingId(t.id)
    setEditDraft({
      title: t.title,
      description: t.description,
      notes: t.notes,
      priority: t.priority,
      status: t.status,
      project_id: t.project_id,
      assigned_worker_id: t.assigned_worker_id,
      due_at: t.due_at,
    })
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="ניהול משימות"
          subtitle="משימות אחזקה נפרדות מתקלות"
          onMenuClick={openMenu}
        />
      )}
      <div style={styles.wrap(isMobile)}>
        {!isMobile && (
          <PageHeader title="ניהול משימות" subtitle="משימות אחזקה נפרדות ממערכת התקלות" />
        )}
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
            <textarea
              style={styles.textarea}
              placeholder="הערות"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
            <label style={styles.check}>
              <input type="checkbox" checked={dayOnly} onChange={(e) => setDayOnly(e.target.checked)} />
              משימות היום / פתוחות ללא תאריך
            </label>
            <label style={styles.check}>
              <input
                type="checkbox"
                checked={groupByWorker}
                onChange={(e) => setGroupByWorker(e.target.checked)}
              />
              קיבוץ לפי עובד
            </label>
          </div>
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
            {grouped.map((group) => (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.label ? (
                  <h3 style={{ margin: '8px 0 0', fontSize: 16, color: theme.colors.textPrimary }}>
                    {group.label}
                    <span style={{ color: theme.colors.textSecondary, fontWeight: 500 }}>
                      {' '}
                      ({group.items.length})
                    </span>
                  </h3>
                ) : null}
                {group.items.map((t) => {
                  const editing = editingId === t.id
                  const atts = attachmentsByTask[t.id] || []
                  return (
                    <Card key={t.id}>
                      {editing ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <input
                            style={styles.input}
                            value={editDraft.title || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                          />
                          <textarea
                            style={styles.textarea}
                            rows={2}
                            placeholder="תיאור"
                            value={editDraft.description || ''}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, description: e.target.value }))
                            }
                          />
                          <textarea
                            style={styles.textarea}
                            rows={2}
                            placeholder="הערות"
                            value={editDraft.notes || ''}
                            onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                          />
                          <div style={styles.actions}>
                            <select
                              style={styles.input}
                              value={editDraft.project_id || ''}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, project_id: e.target.value || null }))
                              }
                            >
                              <option value="">ללא בניין</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <select
                              style={styles.input}
                              value={editDraft.assigned_worker_id || ''}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  assigned_worker_id: e.target.value || null,
                                }))
                              }
                            >
                              <option value="">ללא עובד</option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.full_name}
                                </option>
                              ))}
                            </select>
                            <select
                              style={styles.input}
                              value={editDraft.priority || 'MEDIUM'}
                              onChange={(e) => setEditDraft((d) => ({ ...d, priority: e.target.value }))}
                            >
                              <option value="LOW">נמוכה</option>
                              <option value="MEDIUM">בינונית</option>
                              <option value="HIGH">גבוהה</option>
                              <option value="URGENT">דחופה</option>
                            </select>
                            <select
                              style={styles.input}
                              value={editDraft.status || 'PENDING'}
                              onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value }))}
                            >
                              <option value="PENDING">ממתינה</option>
                              <option value="IN_PROGRESS">בביצוע</option>
                              <option value="DONE">הושלמה</option>
                            </select>
                            <input
                              type="datetime-local"
                              style={styles.input}
                              value={toLocalInput(editDraft.due_at || null)}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  due_at: e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : null,
                                }))
                              }
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button
                              type="button"
                              onClick={() =>
                                void patchTask(t.id, {
                                  title: editDraft.title,
                                  description: editDraft.description ?? null,
                                  notes: editDraft.notes ?? null,
                                  project_id: editDraft.project_id ?? null,
                                  assigned_worker_id: editDraft.assigned_worker_id ?? null,
                                  priority: editDraft.priority,
                                  status: editDraft.status,
                                  due_at: editDraft.due_at ?? null,
                                })
                              }
                            >
                              שמור
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                              ביטול
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={styles.taskHead}>
                            <strong>{t.title}</strong>
                            <span style={styles.badge}>{STATUS_LABEL[t.status] || t.status}</span>
                          </div>
                          <div style={styles.meta}>
                            {projectName(t)} · {relName(t)} · {t.priority}
                            {t.due_at ? ` · ${new Date(t.due_at).toLocaleString('he-IL')}` : ''}
                          </div>
                          {t.description ? <p style={styles.desc}>{t.description}</p> : null}
                          {t.notes ? (
                            <p style={{ ...styles.desc, color: theme.colors.textSecondary }}>
                              הערות: {t.notes}
                            </p>
                          ) : null}
                          {atts.length > 0 ? (
                            <div style={styles.attRow}>
                              {atts.map((a) =>
                                a.public_url && (a.mime_type || '').startsWith('image/') ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={a.id}
                                    src={a.public_url}
                                    alt={a.file_name}
                                    style={styles.thumb}
                                  />
                                ) : (
                                  <a
                                    key={a.id}
                                    href={a.public_url || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 13 }}
                                  >
                                    {a.file_name}
                                  </a>
                                )
                              )}
                            </div>
                          ) : null}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginTop: 8,
                              minWidth: 0,
                            }}
                          >
                            <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(t)}>
                              עריכה
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => fileRefs.current[t.id]?.click()}
                            >
                              צרף קובץ
                            </Button>
                            <input
                              ref={(el) => {
                                fileRefs.current[t.id] = el
                              }}
                              type="file"
                              accept="image/*,application/pdf,video/mp4,video/webm"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void uploadPhoto(t.id, f)
                                e.target.value = ''
                              }}
                            />
                            <select
                              style={{
                                ...styles.input,
                                width: isMobile ? '100%' : 'auto',
                                minWidth: isMobile ? 0 : 140,
                              }}
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
                              style={{
                                ...styles.input,
                                width: isMobile ? '100%' : 'auto',
                                minWidth: isMobile ? 0 : 120,
                              }}
                              value={t.status}
                              onChange={(e) => void patchTask(t.id, { status: e.target.value })}
                            >
                              <option value="PENDING">ממתינה</option>
                              <option value="IN_PROGRESS">בביצוע</option>
                              <option value="DONE">הושלמה</option>
                            </select>
                          </div>
                        </>
                      )}
                    </Card>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? '16px 16px 32px' : '32px 40px',
    maxWidth: mobile ? '100%' : 960,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }),
  formGrid: (mobile: boolean): CSSProperties => ({
    display: 'grid',
    gap: 10,
    gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
    minWidth: 0,
  }),
  input: {
    width: '100%',
    maxWidth: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  textarea: {
    width: '100%',
    maxWidth: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    gridColumn: '1 / -1',
    boxSizing: 'border-box' as const,
    minWidth: 0,
    resize: 'vertical' as const,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap' as const,
    minWidth: 0,
  },
  check: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 14,
    lineHeight: 1.35,
    minWidth: 0,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 0 },
  taskHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap' as const,
    minWidth: 0,
  },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    padding: '4px 8px',
    borderRadius: 8,
    flexShrink: 0,
  },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6, wordBreak: 'break-word' as const },
  desc: { fontSize: 14, margin: '0 0 8px', lineHeight: 1.45, wordBreak: 'break-word' as const },
  actions: { display: 'grid', gridTemplateColumns: '1fr', gap: 8 },
  empty: { textAlign: 'center' as const, color: theme.colors.textSecondary },
  attRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 4 },
  thumb: { width: 64, height: 64, objectFit: 'cover' as const, borderRadius: 8 },
}
