'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'נמוכה',
  MEDIUM: 'בינונית',
  HIGH: 'גבוהה',
  URGENT: 'דחופה',
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

function Field({
  label,
  children,
  hint,
  full,
}: {
  label: string
  children: ReactNode
  hint?: string
  full?: boolean
}) {
  return (
    <label style={{ ...styles.field, ...(full ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span style={styles.fieldHint}>{hint}</span> : null}
    </label>
  )
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const createFileRef = useRef<HTMLInputElement | null>(null)
  const [createFile, setCreateFile] = useState<File | null>(null)

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
      const tasksRes = await fetchWithTimeout('/api/maintenance-tasks')
      if (!tasksRes.ok) {
        toast.error('טעינת משימות נכשלה')
        return
      }
      const json = (await tasksRes.json()) as {
        tasks?: TaskRow[]
        workers?: WorkerOpt[]
        projects?: ProjectOpt[]
      }
      const list = json.tasks || []
      setTasks(list)
      setWorkers(json.workers || [])
      setProjects(json.projects || [])
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
    return tasks.filter((t) => isMaintenanceTaskForToday({ dueAt: t.due_at, status: t.status }))
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
      const json = (await res.json().catch(() => ({}))) as { error?: string; task?: TaskRow }
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'יצירה נכשלה')
        return
      }
      if (createFile && json.task?.id) {
        await uploadPhoto(json.task.id, createFile)
      }
      toast.success('המשימה נוצרה')
      setTitle('')
      setDescription('')
      setNotes('')
      setProjectId('')
      setWorkerId('')
      setDueAt('')
      setCreateFile(null)
      if (createFileRef.current) createFileRef.current.value = ''
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSaving(false)
    }
  }

  async function patchTask(taskId: string, body: Record<string, unknown>, okMsg?: string) {
    setBusyId(taskId)
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
      if (okMsg) toast.success(okMsg)
      setEditingId(null)
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm('למחוק את המשימה?')) return
    setBusyId(taskId)
    try {
      const res = await fetchWithTimeout(
        `/api/maintenance-tasks?task_id=${encodeURIComponent(taskId)}`,
        { method: 'DELETE' },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('מחיקה נכשלה')
        return
      }
      toast.success('המשימה נמחקה')
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
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
          <div style={styles.sectionTitle}>משימה חדשה</div>
          <div style={styles.formGrid(isMobile)}>
            <Field label="כותרת" full>
              <input
                style={styles.input}
                placeholder="למשל: בדיקת משאבה"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="תיאור" full>
              <textarea
                style={styles.textarea}
                placeholder="פירוט קצר (אופציונלי)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="הערות פנימיות" full>
              <textarea
                style={styles.textarea}
                placeholder="הערות למנהל / לעובד"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="בניין">
              <select style={styles.input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">ללא בניין</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="עובד אחראי">
              <select style={styles.input} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                <option value="">ללא עובד</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="עדיפות">
              <select style={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">נמוכה</option>
                <option value="MEDIUM">בינונית</option>
                <option value="HIGH">גבוהה</option>
                <option value="URGENT">דחופה</option>
              </select>
            </Field>
            <Field label="תאריך ושעה לביצוע" hint="אופציונלי — בלי תאריך המשימה נשארת פתוחה עד שסוגרים אותה">
              <input
                type="datetime-local"
                style={styles.input}
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
            <Field label="קובץ / תמונה" full hint={createFile ? createFile.name : 'אופציונלי'}>
              <div style={styles.attachRow}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => createFileRef.current?.click()}
                >
                  {createFile ? 'החלף קובץ' : 'צרף קובץ'}
                </Button>
                {createFile ? (
                  <button
                    type="button"
                    style={styles.clearAttach}
                    onClick={() => {
                      setCreateFile(null)
                      if (createFileRef.current) createFileRef.current.value = ''
                    }}
                  >
                    הסר
                  </button>
                ) : null}
                <input
                  ref={createFileRef}
                  type="file"
                  accept="image/*,application/pdf,video/mp4,video/webm"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    setCreateFile(e.target.files?.[0] || null)
                  }}
                />
              </div>
            </Field>
            <div style={styles.createActions}>
              <Button type="button" onClick={() => void createTask()} disabled={saving}>
                {saving ? 'שומר…' : 'צור משימה'}
              </Button>
            </div>
          </div>
        </Card>

        <div style={styles.toolbar}>
          <div style={styles.filters}>
            <label style={styles.check}>
              <input type="checkbox" checked={dayOnly} onChange={(e) => setDayOnly(e.target.checked)} />
              <span>משימות היום / פתוחות ללא תאריך</span>
            </label>
            <label style={styles.check}>
              <input
                type="checkbox"
                checked={groupByWorker}
                onChange={(e) => setGroupByWorker(e.target.checked)}
              />
              <span>קיבוץ לפי עובד</span>
            </label>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            רענון
          </Button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : visible.length === 0 ? (
          <div style={styles.emptyBox}>
            <p style={styles.empty}>אין משימות להצגה</p>
            {dayOnly ? (
              <p style={styles.emptyHint}>כבו את הסינון «משימות היום» כדי לראות את כל המשימות</p>
            ) : null}
          </div>
        ) : (
          <div style={styles.list}>
            {grouped.map((group) => (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.label ? (
                  <h3 style={styles.groupTitle}>
                    {group.label}
                    <span style={styles.groupCount}> ({group.items.length})</span>
                  </h3>
                ) : null}
                {group.items.map((t) => {
                  const editing = editingId === t.id
                  const atts = attachmentsByTask[t.id] || []
                  const busy = busyId === t.id
                  return (
                    <Card key={t.id}>
                      {editing ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <Field label="כותרת" full>
                            <input
                              style={styles.input}
                              value={editDraft.title || ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                            />
                          </Field>
                          <Field label="תיאור" full>
                            <textarea
                              style={styles.textarea}
                              rows={2}
                              value={editDraft.description || ''}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, description: e.target.value }))
                              }
                            />
                          </Field>
                          <Field label="הערות" full>
                            <textarea
                              style={styles.textarea}
                              rows={2}
                              value={editDraft.notes || ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                            />
                          </Field>
                          <div style={styles.formGrid(true)}>
                            <Field label="בניין">
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
                            </Field>
                            <Field label="עובד">
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
                            </Field>
                            <Field label="עדיפות">
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
                            </Field>
                            <Field label="סטטוס">
                              <select
                                style={styles.input}
                                value={editDraft.status || 'PENDING'}
                                onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value }))}
                              >
                                <option value="PENDING">ממתינה</option>
                                <option value="IN_PROGRESS">בביצוע</option>
                                <option value="DONE">הושלמה</option>
                              </select>
                            </Field>
                            <Field label="תאריך ושעה לביצוע" full>
                              <input
                                type="datetime-local"
                                style={styles.input}
                                value={toLocalInput(editDraft.due_at ?? null)}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    due_at: e.target.value
                                      ? new Date(e.target.value).toISOString()
                                      : null,
                                  }))
                                }
                              />
                            </Field>
                          </div>
                          <div style={styles.cardActions}>
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void patchTask(
                                  t.id,
                                  {
                                    title: editDraft.title,
                                    description: editDraft.description,
                                    notes: editDraft.notes,
                                    priority: editDraft.priority,
                                    status: editDraft.status,
                                    project_id: editDraft.project_id ?? null,
                                    assigned_worker_id: editDraft.assigned_worker_id ?? null,
                                    due_at: editDraft.due_at ?? null,
                                  },
                                  'המשימה עודכנה'
                                )
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
                            <div style={styles.taskTitle}>{t.title}</div>
                            <span style={styles.badge}>{STATUS_LABEL[t.status] || t.status}</span>
                          </div>
                          <div style={styles.meta}>
                            {projectName(t)} · {relName(t)} · {PRIORITY_LABEL[t.priority] || t.priority}
                            {t.due_at
                              ? ` · עד ${new Date(t.due_at).toLocaleString('he-IL')}`
                              : ' · ללא תאריך יעד'}
                          </div>
                          {t.description ? <p style={styles.desc}>{t.description}</p> : null}
                          {t.notes ? <p style={styles.notesLine}>הערות: {t.notes}</p> : null}
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
                          <div style={styles.cardActions}>
                            {t.status !== 'DONE' ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => void patchTask(t.id, { status: 'DONE' }, 'המשימה הושלמה')}
                              >
                                סיום / השלמה
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void patchTask(t.id, { status: 'PENDING' }, 'המשימה נפתחה מחדש')
                                }
                              >
                                פתח מחדש
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => startEdit(t)}
                            >
                              עריכה
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => fileRefs.current[t.id]?.click()}
                            >
                              צרף קובץ / תמונה
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
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              onClick={() => void deleteTask(t.id)}
                            >
                              מחיקה
                            </Button>
                          </div>
                          <div style={styles.quickAssign}>
                            <select
                              style={styles.input}
                              value={t.assigned_worker_id || ''}
                              onChange={(e) =>
                                void patchTask(t.id, {
                                  assigned_worker_id: e.target.value || null,
                                })
                              }
                            >
                              <option value="">העבר לעובד…</option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.full_name}
                                </option>
                              ))}
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
    maxWidth: mobile ? '100%' : 920,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }),
  sectionTitle: {
    fontSize: 15,
    fontWeight: 800,
    marginBottom: 12,
    color: theme.colors.textPrimary,
  },
  formGrid: (mobile: boolean): CSSProperties => ({
    display: 'grid',
    gap: 12,
    gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
    minWidth: 0,
  }),
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.textSecondary,
  },
  fieldHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.35,
  },
  input: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box' as const,
    minWidth: 0,
  },
  textarea: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box' as const,
    minWidth: 0,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  attachRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  clearAttach: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
  },
  createActions: { gridColumn: '1 / -1' as const, marginTop: 4 },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap' as const,
    minWidth: 0,
  },
  filters: { display: 'flex', flexDirection: 'column' as const, gap: 10, flex: 1, minWidth: 0 },
  check: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 14,
    lineHeight: 1.35,
    minWidth: 0,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 0 },
  groupTitle: { margin: '4px 0 0', fontSize: 16, color: theme.colors.textPrimary },
  groupCount: { color: theme.colors.textSecondary, fontWeight: 500 },
  taskHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start',
  },
  taskTitle: { fontWeight: 800, fontSize: 16, wordBreak: 'break-word' as const, flex: 1 },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    padding: '4px 10px',
    borderRadius: 999,
    flexShrink: 0,
  },
  meta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    wordBreak: 'break-word' as const,
    lineHeight: 1.4,
  },
  desc: { fontSize: 14, margin: '0 0 8px', lineHeight: 1.45, wordBreak: 'break-word' as const },
  notesLine: {
    fontSize: 13,
    margin: '0 0 8px',
    color: theme.colors.textSecondary,
    wordBreak: 'break-word' as const,
  },
  cardActions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 10,
  },
  quickAssign: { marginTop: 10 },
  emptyBox: {
    textAlign: 'center' as const,
    padding: '28px 16px',
    borderRadius: 16,
    border: `1px dashed ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  empty: { margin: 0, color: theme.colors.textSecondary, fontWeight: 600 },
  emptyHint: { margin: '8px 0 0', fontSize: 13, color: theme.colors.textSecondary },
  attRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 4 },
  thumb: { width: 64, height: 64, objectFit: 'cover' as const, borderRadius: 10 },
}
