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
      toast.success('התמונה צורפה')
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <LoadingSpinner />

  if (tasks.length === 0) {
    return <p style={{ textAlign: 'center', color: colors.textSecondary }}>אין משימות אחזקה פתוחות</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px 24px' }}>
      {tasks.map((t) => (
        <div
          key={t.id}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 14,
            padding: 14,
            background: colors.surface,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>
            {projectLabel(t)}
            {t.due_at ? ` · ${new Date(t.due_at).toLocaleString('he-IL')}` : ''}
            {` · ${t.status === 'IN_PROGRESS' ? 'בביצוע' : 'ממתינה'}`}
          </div>
          {t.description ? (
            <p style={{ fontSize: 14, margin: '0 0 10px', lineHeight: 1.45 }}>{t.description}</p>
          ) : null}
          <textarea
            value={noteById[t.id] ?? t.notes ?? ''}
            onChange={(e) => setNoteById((prev) => ({ ...prev, [t.id]: e.target.value }))}
            placeholder="הערה"
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              padding: 10,
              marginBottom: 8,
              fontSize: 14,
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {t.status === 'PENDING' ? (
              <Button
                type="button"
                disabled={busyId === t.id}
                onClick={() => void updateStatus(t.id, 'IN_PROGRESS')}
              >
                התחל
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={busyId === t.id}
              onClick={() => void updateStatus(t.id, 'DONE')}
            >
              סיים
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busyId === t.id}
              onClick={() => fileRefs.current[t.id]?.click()}
            >
              צרף תמונה
            </Button>
            <input
              ref={(el) => {
                fileRefs.current[t.id] = el
              }}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadPhoto(t.id, f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
