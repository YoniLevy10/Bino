'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AppShell,
  Button,
  Drawer,
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

type ListFilter = 'open' | 'today' | 'all'

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

const emptyForm = {
  title: '',
  description: '',
  notes: '',
  projectId: '',
  workerId: '',
  priority: 'MEDIUM',
  dueAt: '',
}

export default function TasksPage() {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [workers, setWorkers] = useState<WorkerOpt[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [listFilter, setListFilter] = useState<ListFilter>('open')
  const [groupByWorker, setGroupByWorker] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
    if (listFilter === 'all') return tasks
    if (listFilter === 'today') {
      return tasks.filter((t) => isMaintenanceTaskForToday({ dueAt: t.due_at, status: t.status }))
    }
    return tasks.filter((t) => t.status !== 'DONE')
  }, [tasks, listFilter])

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

  function openCreate() {
    setEditingTask(null)
    setForm(emptyForm)
    setCreateFile(null)
    if (createFileRef.current) createFileRef.current.value = ''
    setDrawerOpen(true)
  }

  function openEdit(t: TaskRow) {
    setEditingTask(t)
    setForm({
      title: t.title,
      description: t.description || '',
      notes: t.notes || '',
      projectId: t.project_id || '',
      workerId: t.assigned_worker_id || '',
      priority: t.priority || 'MEDIUM',
      dueAt: toLocalInput(t.due_at),
    })
    setCreateFile(null)
    if (createFileRef.current) createFileRef.current.value = ''
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingTask(null)
    setForm(emptyForm)
    setCreateFile(null)
  }

  async function saveTask() {
    if (!form.title.trim()) {
      toast.error('נא למלא כותרת')
      return
    }
    setSaving(true)
    try {
      if (editingTask) {
        const res = await fetchWithTimeout(
          '/api/maintenance-tasks',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: editingTask.id,
              title: form.title.trim(),
              description: form.description.trim() || null,
              notes: form.notes.trim() || null,
              project_id: form.projectId || null,
              assigned_worker_id: form.workerId || null,
              priority: form.priority,
              due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        if (!res.ok) {
          toast.error('עדכון נכשל')
          return
        }
        if (createFile) await uploadPhoto(editingTask.id, createFile)
        toast.success('המשימה עודכנה')
      } else {
        const res = await fetchWithTimeout(
          '/api/maintenance-tasks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title.trim(),
              description: form.description.trim() || null,
              notes: form.notes.trim() || null,
              project_id: form.projectId || null,
              assigned_worker_id: form.workerId || null,
              priority: form.priority,
              due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { error?: string; task?: TaskRow }
        if (!res.ok) {
          toast.error(typeof json.error === 'string' ? json.error : 'יצירה נכשלה')
          return
        }
        if (createFile && json.task?.id) await uploadPhoto(json.task.id, createFile)
        toast.success('המשימה נוצרה')
      }
      closeDrawer()
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
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleDone(t: TaskRow) {
    if (t.status === 'DONE') {
      await patchTask(t.id, { status: 'PENDING' })
    } else {
      await patchTask(t.id, { status: 'DONE' }, 'הושלמה')
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
      if (expandedId === taskId) setExpandedId(null)
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

  const createBtn = (
    <Button variant="primary" onClick={openCreate}>
      משימה חדשה
    </Button>
  )

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="משימות"
          subtitle="רשימת משימות אחזקה"
          onMenuClick={openMenu}
        />
      )}

      {isMobile && <div style={styles.mobileCreateRow}>{createBtn}</div>}

      <div style={styles.wrap(isMobile)}>
        {!isMobile && (
          <PageHeader
            title="משימות"
            subtitle="רשימת משימות אחזקה — כמו todo"
            actions={createBtn}
          />
        )}

        <div style={styles.toolbar}>
          <div style={styles.chips}>
            {(
              [
                { id: 'open', label: 'פתוחות' },
                { id: 'today', label: 'היום' },
                { id: 'all', label: 'הכל' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setListFilter(c.id)}
                style={{
                  ...styles.chip,
                  ...(listFilter === c.id ? styles.chipActive : null),
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label style={styles.check}>
            <input
              type="checkbox"
              checked={groupByWorker}
              onChange={(e) => setGroupByWorker(e.target.checked)}
            />
            <span>לפי עובד</span>
          </label>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : visible.length === 0 ? (
          <div style={styles.emptyBox}>
            <p style={styles.empty}>אין משימות להצגה</p>
            <div style={{ marginTop: 12 }}>{createBtn}</div>
          </div>
        ) : (
          <div style={styles.listCard}>
            {grouped.map((group) => (
              <div key={group.key}>
                {group.label ? (
                  <div style={styles.groupTitle}>
                    {group.label}
                    <span style={styles.groupCount}> · {group.items.length}</span>
                  </div>
                ) : null}
                {group.items.map((t) => {
                  const done = t.status === 'DONE'
                  const expanded = expandedId === t.id
                  const atts = attachmentsByTask[t.id] || []
                  const busy = busyId === t.id
                  return (
                    <div key={t.id} style={styles.todoRow}>
                      <div style={styles.todoMain}>
                        <button
                          type="button"
                          aria-label={done ? 'פתח מחדש' : 'סמן כהושלם'}
                          disabled={busy}
                          onClick={() => void toggleDone(t)}
                          style={{
                            ...styles.checkBtn,
                            ...(done ? styles.checkBtnDone : null),
                          }}
                        >
                          {done ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          style={styles.todoBody}
                          onClick={() => setExpandedId(expanded ? null : t.id)}
                        >
                          <div
                            style={{
                              ...styles.todoTitle,
                              ...(done ? styles.todoTitleDone : null),
                            }}
                          >
                            {t.title}
                          </div>
                          <div style={styles.todoMeta}>
                            {projectName(t)} · {relName(t)}
                            {t.due_at
                              ? ` · ${new Date(t.due_at).toLocaleString('he-IL', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''}
                            {t.priority === 'HIGH' || t.priority === 'URGENT'
                              ? ` · ${PRIORITY_LABEL[t.priority]}`
                              : ''}
                          </div>
                        </button>
                      </div>

                      {expanded ? (
                        <div style={styles.expand}>
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
                            <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(t)}>
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
                          <div style={{ marginTop: 8 }}>
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
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingTask ? 'עריכת משימה' : 'משימה חדשה'}
        subtitle={editingTask ? 'עדכון פרטי המשימה' : 'הוספה לרשימת המשימות'}
        isMobile={isMobile}
        footer={
          <div style={styles.drawerFooter}>
            <Button type="button" variant="secondary" onClick={closeDrawer} disabled={saving}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void saveTask()} disabled={saving}>
              {saving ? 'שומר…' : editingTask ? 'שמור' : 'צור משימה'}
            </Button>
          </div>
        }
      >
        <div style={styles.formGrid}>
          <Field label="כותרת" full>
            <input
              style={styles.input}
              placeholder="למשל: בדיקת משאבה"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus={!isMobile}
            />
          </Field>
          <Field label="תיאור" full>
            <textarea
              style={styles.textarea}
              placeholder="פירוט קצר (אופציונלי)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </Field>
          <Field label="הערות פנימיות" full>
            <textarea
              style={styles.textarea}
              placeholder="הערות למנהל / לעובד"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </Field>
          <Field label="בניין">
            <select
              style={styles.input}
              value={form.projectId}
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
            >
              <option value="">ללא בניין</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="עובד אחראי">
            <select
              style={styles.input}
              value={form.workerId}
              onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
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
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="LOW">נמוכה</option>
              <option value="MEDIUM">בינונית</option>
              <option value="HIGH">גבוהה</option>
              <option value="URGENT">דחופה</option>
            </select>
          </Field>
          <Field
            label="תאריך ושעה לביצוע"
            hint="אופציונלי — בלי תאריך המשימה נשארת פתוחה"
          >
            <input
              type="datetime-local"
              style={styles.input}
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
            />
          </Field>
          <Field label="קובץ / תמונה" full hint={createFile ? createFile.name : 'אופציונלי'}>
            <div style={styles.attachRow}>
              <Button type="button" variant="secondary" onClick={() => createFileRef.current?.click()}>
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
                onChange={(e) => setCreateFile(e.target.files?.[0] || null)}
              />
            </div>
          </Field>
        </div>
      </Drawer>
    </AppShell>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? '12px 16px 32px' : '32px 40px',
    maxWidth: mobile ? '100%' : 820,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }),
  mobileCreateRow: {
    padding: '12px 16px 0',
    display: 'flex',
    justifyContent: 'flex-start',
  } as CSSProperties,
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  } as CSSProperties,
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  chip: {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  } as CSSProperties,
  chipActive: {
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    borderColor: theme.colors.primary,
  } as CSSProperties,
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: theme.colors.textSecondary,
  } as CSSProperties,
  listCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 16,
    overflow: 'hidden',
  } as CSSProperties,
  groupTitle: {
    padding: '12px 16px 6px',
    fontSize: 13,
    fontWeight: 800,
    color: theme.colors.textSecondary,
    background: theme.colors.background,
    borderBottom: `1px solid ${theme.colors.border}`,
  } as CSSProperties,
  groupCount: { fontWeight: 500 } as CSSProperties,
  todoRow: {
    borderBottom: `1px solid ${theme.colors.border}`,
    padding: '12px 14px',
  } as CSSProperties,
  todoMain: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  } as CSSProperties,
  checkBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    border: `2px solid ${theme.colors.border}`,
    background: 'transparent',
    flexShrink: 0,
    marginTop: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: '#fff',
  } as CSSProperties,
  checkBtnDone: {
    background: theme.colors.success,
    borderColor: theme.colors.success,
  } as CSSProperties,
  todoBody: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  } as CSSProperties,
  todoTitle: {
    fontWeight: 700,
    fontSize: 15,
    lineHeight: 1.35,
    wordBreak: 'break-word',
    color: theme.colors.textPrimary,
  } as CSSProperties,
  todoTitleDone: {
    textDecoration: 'line-through',
    color: theme.colors.textSecondary,
    fontWeight: 600,
  } as CSSProperties,
  todoMeta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
    wordBreak: 'break-word',
  } as CSSProperties,
  expand: {
    marginTop: 12,
    marginInlineStart: 38,
    paddingTop: 10,
    borderTop: `1px dashed ${theme.colors.border}`,
  } as CSSProperties,
  desc: {
    fontSize: 14,
    margin: '0 0 8px',
    lineHeight: 1.45,
    wordBreak: 'break-word',
  } as CSSProperties,
  notesLine: {
    fontSize: 13,
    margin: '0 0 8px',
    color: theme.colors.textSecondary,
    wordBreak: 'break-word',
  } as CSSProperties,
  cardActions: { display: 'flex', flexWrap: 'wrap', gap: 8 } as CSSProperties,
  emptyBox: {
    textAlign: 'center',
    padding: '36px 16px',
    borderRadius: 16,
    border: `1px dashed ${theme.colors.border}`,
    background: theme.colors.surface,
  } as CSSProperties,
  empty: { margin: 0, color: theme.colors.textSecondary, fontWeight: 600 } as CSSProperties,
  attRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 } as CSSProperties,
  thumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 10 } as CSSProperties,
  formGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: '1fr',
    minWidth: 0,
  } as CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  } as CSSProperties,
  fieldLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.textSecondary,
  } as CSSProperties,
  fieldHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.35,
  } as CSSProperties,
  input: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box',
    minWidth: 0,
  } as CSSProperties,
  textarea: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box',
    minWidth: 0,
    resize: 'vertical',
    fontFamily: 'inherit',
  } as CSSProperties,
  attachRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } as CSSProperties,
  clearAttach: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
  } as CSSProperties,
  drawerFooter: {
    display: 'flex',
    gap: 10,
    justifyContent: 'stretch',
  } as CSSProperties,
}
