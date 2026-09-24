'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS, WORKER_PHOTO_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, LoadingSpinner, type theme } from '../ui'

type MaintenanceTask = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  notes: string | null
  projects?: { name?: string | null; address?: string | null } | { name?: string | null; address?: string | null }[] | null
}

type Props = {
  token: string
  colors: typeof theme.colors
  refreshKey?: number
}

const PRIORITY_HE: Record<string, string> = {
  LOW: 'נמוכה',
  MEDIUM: 'בינונית',
  HIGH: 'גבוהה',
  URGENT: 'דחופה',
}

function projectLabel(t: MaintenanceTask): string {
  const p = Array.isArray(t.projects) ? t.projects[0] : t.projects
  if (!p?.name) return 'ללא בניין'
  return p.address ? `${p.name} · ${p.address}` : p.name
}

export function WorkerMaintenancePanel({ token, colors, refreshKey = 0 }: Props) {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [noteById, setNoteById] = useState<Record<string, string>>({})
  const [attachedNameById, setAttachedNameById] = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/worker/maintenance-tasks?token=${encodeURIComponent(token)}`
      )
      if (!res.ok) {
        toast.error('טעינת משימות נכשלה')
        return
      }
      const json = (await res.json()) as { tasks?: MaintenanceTask[] }
      setTasks(json.tasks || [])
    } catch {
      toast.error('טעינת משימות נכשלה')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshKey > 0) void load({ silent: true })
  }, [refreshKey, load])

  async function updateStatus(taskId: string, status: string) {
    setBusyId(taskId)
    try {
      const notes = noteById[taskId]?.trim() || undefined
      const res = await fetchWithTimeout(
        '/api/worker/maintenance-tasks',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            task_id: taskId,
            status,
            notes: notes || null,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('עדכון נכשל')
        return
      }
      toast.success(status === 'DONE' ? 'המשימה הושלמה' : 'הסטטוס עודכן')
      await load({ silent: true })
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function uploadPhoto(taskId: string, file: File) {
    setBusyId(taskId)
    try {
      const fd = new FormData()
      fd.append('token', token)
      fd.append('task_id', taskId)
      fd.append('file', file)
      const res = await fetchWithTimeout(
        '/api/worker/maintenance-tasks',
        { method: 'POST', body: fd },
        WORKER_PHOTO_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('העלאת תמונה נכשלה')
        return
      }
      setAttachedNameById((prev) => ({ ...prev, [taskId]: file.name }))
      toast.success('התמונה / הקובץ צורפו')
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <LoadingSpinner />

  if (tasks.length === 0) {
    return (
      <div style={emptyStyles(colors).box}>
        <p style={emptyStyles(colors).title}>אין משימות אחזקה להיום</p>
        <p style={emptyStyles(colors).sub}>כשהמנהלת תשייך משימה — היא תופיע כאן</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 12px 28px' }}>
      {tasks.map((t) => {
        const busy = busyId === t.id
        const statusLabel =
          t.status === 'IN_PROGRESS' ? 'בביצוע' : t.status === 'DONE' ? 'הושלמה' : 'ממתינה'
        return (
          <div key={t.id} style={cardStyles(colors).card}>
            <div style={cardStyles(colors).head}>
              <div style={cardStyles(colors).title}>{t.title}</div>
              <span style={cardStyles(colors).badge}>{statusLabel}</span>
            </div>
            <div style={cardStyles(colors).meta}>
              {projectLabel(t)}
              {t.due_at ? ` · ${new Date(t.due_at).toLocaleString('he-IL')}` : ' · ללא תאריך יעד'}
              {` · עדיפות ${PRIORITY_HE[t.priority] || t.priority}`}
            </div>
            {t.description ? <p style={cardStyles(colors).desc}>{t.description}</p> : null}

            <label style={cardStyles(colors).field}>
              <span style={cardStyles(colors).fieldLabel}>הערה שלך</span>
              <textarea
                value={noteById[t.id] ?? t.notes ?? ''}
                onChange={(e) => setNoteById((prev) => ({ ...prev, [t.id]: e.target.value }))}
                placeholder="מה בוצע / מה חשוב לדעת"
                rows={2}
                style={cardStyles(colors).textarea}
              />
            </label>

            <div style={cardStyles(colors).attachBox}>
              <div style={cardStyles(colors).attachText}>
                <div style={cardStyles(colors).attachTitle}>תמונה / קובץ</div>
                <div style={cardStyles(colors).attachHint}>
                  {attachedNameById[t.id]
                    ? `צורף: ${attachedNameById[t.id]}`
                    : 'צלמו או בחרו קובץ לתיעוד הביצוע'}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => fileRefs.current[t.id]?.click()}
              >
                העלאה
              </Button>
              <input
                ref={(el) => {
                  fileRefs.current[t.id] = el
                }}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadPhoto(t.id, f)
                  e.target.value = ''
                }}
              />
            </div>

            <div style={cardStyles(colors).actions}>
              {t.status === 'PENDING' ? (
                <Button type="button" disabled={busy} onClick={() => void updateStatus(t.id, 'IN_PROGRESS')}>
                  התחל משימה
                </Button>
              ) : null}
              {t.status !== 'DONE' ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateStatus(t.id, 'DONE')}
                >
                  סיום / השלמה
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function emptyStyles(colors: typeof theme.colors): Record<string, CSSProperties> {
  return {
    box: {
      margin: '8px 12px 24px',
      padding: '28px 16px',
      textAlign: 'center',
      borderRadius: 16,
      border: `1px dashed ${colors.border}`,
      background: colors.surface,
    },
    title: { margin: 0, fontWeight: 800, color: colors.textPrimary },
    sub: { margin: '8px 0 0', fontSize: 13, color: colors.textSecondary },
  }
}

function cardStyles(colors: typeof theme.colors): Record<string, CSSProperties> {
  return {
    card: {
      border: `1px solid ${colors.border}`,
      borderRadius: 16,
      padding: 16,
      background: colors.surface,
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    },
    head: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    title: { fontWeight: 800, fontSize: 16, lineHeight: 1.35, flex: 1, wordBreak: 'break-word' },
    badge: {
      fontSize: 12,
      fontWeight: 700,
      color: colors.primary,
      background: colors.primaryMuted,
      padding: '4px 10px',
      borderRadius: 999,
      flexShrink: 0,
    },
    meta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      lineHeight: 1.4,
      wordBreak: 'break-word',
    },
    desc: { fontSize: 14, margin: '0 0 12px', lineHeight: 1.45, wordBreak: 'break-word' },
    field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
    fieldLabel: { fontSize: 13, fontWeight: 700, color: colors.textSecondary },
    textarea: {
      width: '100%',
      boxSizing: 'border-box',
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      padding: 12,
      fontSize: 16,
      fontFamily: 'inherit',
      resize: 'vertical',
      background: colors.background || '#f8fafc',
    },
    attachBox: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      border: `1px dashed ${colors.border}`,
      background: colors.background || '#f8fafc',
      marginBottom: 12,
    },
    attachText: { flex: 1, minWidth: 0 },
    attachTitle: { fontWeight: 800, fontSize: 14 },
    attachHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, wordBreak: 'break-word' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  }
}
