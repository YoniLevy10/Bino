'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, type theme } from '../ui'

type ProjectOption = { id: string; name: string }

type Suggestion = {
  title: string
  description: string
  project_id: string
  project_name: string
  priority: 'MEDIUM' | 'HIGH'
  reason: string
  source_ticket_id: string
}

type Props = {
  token: string
  colors: typeof theme.colors
  onCreated: () => void
}

export function WorkerMaintenanceCreate({ token, colors, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<'MEDIUM' | 'HIGH'>('MEDIUM')
  const [sourceTicketId, setSourceTicketId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingSuggest(true)
    void fetchWithTimeout(`/api/worker/maintenance-suggest?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('failed')
        return (await res.json()) as { suggestion?: Suggestion | null; projects?: ProjectOption[] }
      })
      .then((json) => {
        if (cancelled) return
        const nextProjects = json.projects || []
        setProjects(nextProjects)
        const draft = json.suggestion || null
        setSuggestion(draft)
        if (draft) {
          setTitle(draft.title)
          setDescription(draft.description)
          setProjectId(draft.project_id)
          setPriority(draft.priority)
          setSourceTicketId(draft.source_ticket_id)
        } else if (nextProjects[0]) {
          setProjectId(nextProjects[0].id)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('טעינת ההמלצה נכשלה')
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggest(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, token])

  function clearToManual() {
    setSuggestion(null)
    setTitle('')
    setDescription('')
    setPriority('MEDIUM')
    setSourceTicketId(null)
    if (projects[0]) setProjectId(projects[0].id)
  }

  async function save() {
    if (!title.trim() || !projectId) {
      toast.error('צריך בניין וכותרת')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout(
        '/api/worker/maintenance-tasks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            title: title.trim(),
            description: description.trim() || null,
            project_id: projectId,
            priority,
            source_ticket_id: sourceTicketId,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('פתיחת המשימה נכשלה')
        return
      }
      toast.success('המשימה נפתחה ומופיעה גם אצל המנהל')
      setOpen(false)
      clearToManual()
      onCreated()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div style={styles.wrap}>
        <Button type="button" onClick={() => setOpen(true)}>
          משימת אחזקה חדשה
        </Button>
      </div>
    )
  }

  return (
    <div className="lg-glass" style={styles.card}>
      <div style={styles.head}>
        <h2 style={styles.title(colors)}>פתיחת משימה</h2>
        <button type="button" style={styles.close(colors)} onClick={() => setOpen(false)}>
          סגור
        </button>
      </div>
      <p style={styles.note(colors)}>המשימה נשמרת גם בדשבורד של המנהל. אפשר לערוך כל שדה לפני הפתיחה.</p>
      {loadingSuggest ? <p style={styles.note(colors)}>מחפש דפוס בתקלות ששויכו אליך…</p> : null}
      {suggestion ? (
        <p style={styles.reason(colors)}>{suggestion.reason}</p>
      ) : !loadingSuggest ? (
        <p style={styles.note(colors)}>אין עדיין מספיק תקלות חוזרות להמלצה. אפשר לפתוח משימה ידנית.</p>
      ) : null}

      <label style={styles.field}>
        <span style={styles.label(colors)}>בניין</span>
        <select
          className="lg-field"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={styles.input(colors)}
        >
          <option value="">בחרו בניין</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.field}>
        <span style={styles.label(colors)}>כותרת</span>
        <input
          className="lg-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={styles.input(colors)}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label(colors)}>תיאור</span>
        <textarea
          className="lg-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={styles.input(colors)}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label(colors)}>עדיפות</span>
        <select
          className="lg-field"
          value={priority}
          onChange={(e) => setPriority(e.target.value === 'HIGH' ? 'HIGH' : 'MEDIUM')}
          style={styles.input(colors)}
        >
          <option value="MEDIUM">בינונית</option>
          <option value="HIGH">גבוהה</option>
        </select>
      </label>
      <div style={styles.actions}>
        <Button type="button" onClick={() => void save()} loading={saving} disabled={!title.trim() || !projectId}>
          פתח משימה
        </Button>
        {suggestion ? (
          <Button type="button" variant="secondary" onClick={clearToManual}>
            עריכה ידנית
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const styles = {
  wrap: { padding: '0 12px 12px' } as CSSProperties,
  card: { margin: '0 12px 14px', padding: 14, borderRadius: 16 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 } as CSSProperties,
  title: (c: typeof theme.colors): CSSProperties => ({ margin: 0, fontSize: 16, fontWeight: 800, color: c.textPrimary }),
  close: (c: typeof theme.colors): CSSProperties => ({
    border: 'none',
    background: 'transparent',
    color: c.textSecondary,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  note: (c: typeof theme.colors): CSSProperties => ({ margin: '8px 0 0', fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }),
  reason: (c: typeof theme.colors): CSSProperties => ({
    margin: '8px 0 0',
    fontSize: 13,
    fontWeight: 700,
    color: c.primary,
    lineHeight: 1.4,
  }),
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 } as CSSProperties,
  label: (c: typeof theme.colors): CSSProperties => ({ fontSize: 12, fontWeight: 700, color: c.textSecondary }),
  input: (c: typeof theme.colors): CSSProperties => ({
    width: '100%',
    boxSizing: 'border-box',
    border: 'none',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontFamily: 'inherit',
    background: 'transparent',
    color: c.textPrimary,
  }),
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 } as CSSProperties,
}
