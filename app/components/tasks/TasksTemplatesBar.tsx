'use client'

import { useState, type CSSProperties } from 'react'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/shared/fetch-with-timeout'
import { toast } from '@/lib/errors/error-handler'
import { Button, Card, Select, theme } from '@/app/components/ui'

type ProjectOpt = { id: string; name: string }

type Props = {
  projects: ProjectOpt[]
  onApplied?: () => void
}

export function TasksTemplatesBar({ projects, onApplied }: Props) {
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<
    Array<{ title: string; cadence: string; project_id: string }> | null
  >(null)
  const [setName, setSetName] = useState('')
  const [savingSet, setSavingSet] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  async function apply(opts: { previewOnly?: boolean; projectIds?: string[] }) {
    const ids = opts.projectIds?.length ? opts.projectIds : projectId ? [projectId] : []
    if (ids.length === 0) {
      toast.error('בחרו בניין')
      return
    }
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/apply-building-templates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: ids[0],
            project_ids: ids,
            preview_only: Boolean(opts.previewOnly),
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        preview?: Array<{ title: string; cadence: string; project_id: string }>
        created?: number
      }
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'החלת תבנית נכשלה')
        return
      }
      if (opts.previewOnly) {
        setPreview(json.preview || [])
        toast.success(`תצוגה מקדימה: ${(json.preview || []).length} משימות`)
        return
      }
      setPreview(null)
      toast.success(`נוצרו ${json.created ?? 0} משימות מהתבנית`)
      onApplied?.()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusy(false)
    }
  }

  async function saveOrgSetFromBuiltin() {
    if (!setName.trim()) {
      toast.error('שם לסט תבניות')
      return
    }
    setSavingSet(true)
    try {
      const catalog = await fetchWithTimeout('/api/maintenance-task-templates')
      const catJson = (await catalog.json()) as {
        builtin?: Array<{
          title: string
          cadence: string
          priority?: string
          checklist?: string[]
          estimated_minutes?: number
          description?: string
        }>
      }
      const items = (catJson.builtin || []).map((t) => ({
        title: t.title,
        cadence: t.cadence,
        priority: t.priority || 'MEDIUM',
        checklist: t.checklist || [],
        estimated_minutes: t.estimated_minutes,
        description: t.description,
      }))
      const res = await fetchWithTimeout(
        '/api/maintenance-task-templates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: setName.trim(), items }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('שמירת סט נכשלה')
        return
      }
      toast.success('סט תבניות נשמר לארגון')
      setSetName('')
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSavingSet(false)
    }
  }

  return (
    <Card
      title="תבנית אחזקה לבניין"
      subtitle="בחרו בניין והחילו את סט המשימות המחזוריות — אפשר גם תצוגה מקדימה לפני יצירה."
    >
      <div style={styles.mainRow}>
        <div style={styles.selectWrap}>
          <Select
            value={projectId}
            onChange={setProjectId}
            placeholder="בחירת בניין…"
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            style={{ width: '100%' }}
          />
        </div>
        <div style={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void apply({ previewOnly: true })}
            style={styles.btnGrow}
          >
            תצוגה מקדימה
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void apply({})}
            style={styles.btnGrow}
          >
            {busy ? 'מחיל…' : 'החל תבנית'}
          </Button>
        </div>
      </div>

      {preview && preview.length > 0 ? (
        <ul style={styles.preview}>
          {preview.slice(0, 20).map((p, i) => (
            <li key={`${p.project_id}-${p.title}-${i}`}>
              {p.title} · {p.cadence}
            </li>
          ))}
          {preview.length > 20 ? <li>…ועוד {preview.length - 20}</li> : null}
        </ul>
      ) : null}

      <button
        type="button"
        style={styles.advancedToggle}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? 'הסתר אפשרויות מתקדמות' : 'אפשרויות מתקדמות'}
      </button>

      {showAdvanced ? (
        <div style={styles.advanced}>
          <p style={styles.advancedHint}>שמירת סט התבניות המובנה כספרייה לארגון.</p>
          <div style={styles.mainRow}>
            <input
              style={styles.input}
              placeholder="שם הסט"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={savingSet}
              onClick={() => void saveOrgSetFromBuiltin()}
            >
              שמור סט
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  mainRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch',
  },
  selectWrap: { flex: '1 1 220px', minWidth: 0 },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    flex: '1 1 200px',
  },
  btnGrow: { flex: '1 1 120px', minHeight: 44 },
  preview: {
    margin: '12px 0 0',
    paddingInlineStart: 18,
    fontSize: 13,
    color: theme.colors.textSecondary,
    columns: 2,
  },
  advancedToggle: {
    marginTop: 14,
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  advanced: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  advancedHint: { margin: 0, fontSize: 12, color: theme.colors.textMuted },
  input: {
    flex: 1,
    minWidth: 140,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontFamily: 'inherit',
    fontSize: 14,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
  },
}
