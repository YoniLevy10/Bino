'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'

type TagRow = {
  id: string
  tag_code: string
  tag_type: string
  label: string | null
  is_active: boolean
  scan_url?: string
  projects?: { name?: string; project_code?: string } | null
}

type Project = { id: string; name: string; project_code: string }

export function ClientAttendanceTagsPanel({
  clientId,
  secret,
  projects,
}: {
  clientId: string
  secret: string
  projects: Project[]
}) {
  const [stampAddonEnabled, setStampAddonEnabled] = useState(false)
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tag_code: '',
    tag_type: 'office' as 'office' | 'project',
    project_id: '',
    label: '',
  })
  const [lastUrl, setLastUrl] = useState<string | null>(null)

  const loadAddons = useCallback(async () => {
    const res = await fetch(`/api/superadmin/client/${clientId}/addons`, {
      headers: { 'x-admin-secret': secret },
    })
    const body = (await res.json().catch(() => ({}))) as {
      addons?: { addon_key: string; enabled: boolean }[]
    }
    if (res.ok) {
      const on = (body.addons ?? []).some((a) => a.addon_key === 'worker_stamp' && a.enabled)
      setStampAddonEnabled(on)
      return on
    }
    return false
  }, [clientId, secret])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags`, {
        headers: { 'x-admin-secret': secret },
      })
      const body = (await res.json().catch(() => ({}))) as { tags?: TagRow[] }
      if (res.ok) setTags(body.tags ?? [])
    } finally {
      setLoading(false)
    }
  }, [clientId, secret])

  useEffect(() => {
    void (async () => {
      const on = await loadAddons()
      if (on) void load()
    })()
  }, [loadAddons, load])

  async function createTag() {
    if (!form.tag_code.trim()) return
    setSaving(true)
    setLastUrl(null)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/attendance-tags`, {
        method: 'POST',
        headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_code: form.tag_code.trim(),
          tag_type: form.tag_type,
          project_id: form.tag_type === 'project' ? form.project_id || null : null,
          label: form.label.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; scan_url?: string }
      if (!res.ok) {
        alert(body.error || 'יצירה נכשלה')
        return
      }
      setLastUrl(body.scan_url ?? null)
      setForm({ tag_code: '', tag_type: 'office', project_id: '', label: '' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (!stampAddonEnabled) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>חתמת עובדים (QR / NFC)</div>
        <p style={hintStyle}>
          הפעילו את התוסף &quot;חתמת עובדים&quot; ללקוח למעלה, ואז תוכלו ליצור תגים ולהוציא QR.
        </p>
      </div>
    )
  }

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>חתמת עובדים — תגים ו-QR (במקור מנפיק)</div>
      <p style={hintStyle}>
        הדפיסו QR מהקישור. העובד פותח את האזור האישי פעם אחת עם אינטרנט, ואז סורק גם Offline.
      </p>

      <div style={formRow}>
        <input
          style={inputStyle}
          placeholder="קוד תג (OFFICE_01)"
          value={form.tag_code}
          onChange={(e) => setForm((f) => ({ ...f, tag_code: e.target.value }))}
        />
        <select
          style={inputStyle}
          value={form.tag_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, tag_type: e.target.value as 'office' | 'project', project_id: '' }))
          }
        >
          <option value="office">משרד</option>
          <option value="project">פרויקט</option>
        </select>
        {form.tag_type === 'project' ? (
          <select
            style={inputStyle}
            value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          >
            <option value="">בחר פרויקט</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.project_code})
              </option>
            ))}
          </select>
        ) : null}
        <input
          style={inputStyle}
          placeholder="תווית"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        />
        <LoadingButton onClick={() => void createTag()} loading={saving} loadingText="יוצר..." size="sm">
          צור תג + QR
        </LoadingButton>
      </div>

      {lastUrl ? (
        <p style={{ ...hintStyle, direction: 'ltr', wordBreak: 'break-all' }}>
          קישור סריקה: {lastUrl}
          <button
            type="button"
            style={copyBtn}
            onClick={() => void navigator.clipboard.writeText(lastUrl)}
          >
            העתק
          </button>
        </p>
      ) : null}

      {loading ? (
        <p style={hintStyle}>טוען תגים...</p>
      ) : tags.length === 0 ? (
        <p style={hintStyle}>אין תגים — צרו תג משרד ותג לכל בניין לפי הצורך.</p>
      ) : (
        <ul style={{ margin: 0, paddingRight: 18, fontSize: 13 }}>
          {tags.map((t) => (
            <li key={t.id} style={{ marginBottom: 8 }}>
              <strong>{t.tag_code}</strong> · {t.tag_type === 'office' ? 'משרד' : 'פרויקט'}
              {t.label ? ` · ${t.label}` : ''}
              {t.scan_url ? (
                <div style={{ direction: 'ltr', fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                  {t.scan_url}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const boxStyle: CSSProperties = {
  marginBottom: theme.spacing.xl,
  padding: theme.spacing.lg,
  background: theme.colors.surface,
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
}

const titleStyle: CSSProperties = {
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.sm,
  marginBottom: theme.spacing.sm,
}

const hintStyle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.textMuted,
  lineHeight: 1.45,
}

const formRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 10,
}

const inputStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`,
  fontSize: theme.typography.fontSize.sm,
  minWidth: 100,
}

const copyBtn: CSSProperties = {
  marginRight: 8,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: theme.colors.primary,
  fontSize: 12,
}
