'use client'

/**
 * Building Hub — ועד tab (Wave 4).
 * Roster CRUD against building_committee_members (history kept when ending).
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  COMMITTEE_ROLE_LABELS_HE,
  type CommitteeRole,
} from '@/lib/building-governance/roles'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'

type Member = {
  id: string
  full_name: string
  role: CommitteeRole
  phone: string | null
  email: string | null
  term_start: string | null
  term_end: string | null
  is_active: boolean
  notes: string | null
}

type Props = {
  projectId: string
  projectName: string
  isMobile?: boolean
}

const ROLE_OPTIONS = (Object.keys(COMMITTEE_ROLE_LABELS_HE) as CommitteeRole[]).map((k) => ({
  value: k,
  label: COMMITTEE_ROLE_LABELS_HE[k],
}))

export function BuildingCommitteePanel({
  projectId,
  projectName,
  isMobile: isMobileProp,
}: Props) {
  const [viewportMobile, setViewportMobile] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<CommitteeRole>('member')
  const [phone, setPhone] = useState('')
  const [missingTable, setMissingTable] = useState(false)

  useEffect(() => {
    if (typeof isMobileProp === 'boolean') return
    const check = () => setViewportMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const isMobile = typeof isMobileProp === 'boolean' ? isMobileProp : viewportMobile

  const load = useCallback(async () => {
    setLoading(true)
    setMissingTable(false)
    try {
      const res = await fetchWithTimeout(
        `/api/building-governance/committee?project_id=${encodeURIComponent(projectId)}`
      )
      const json = (await res.json()) as { members?: Member[]; error?: string }
      if (!res.ok) {
        const msg = errorMessageFromResponseJson(json, `שגיאה ${res.status}`)
        if (/relation|does not exist|schema cache|building_committee/i.test(msg)) {
          setMissingTable(true)
          setMembers([])
          return
        }
        throw new Error(msg)
      }
      setMembers((json.members ?? []) as Member[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת ועד נכשלה')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('נא להזין שם')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/committee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          full_name: fullName.trim(),
          role,
          phone: phone.trim() || null,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('חבר ועד נוסף')
      setFullName('')
      setPhone('')
      setRole('member')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function endMembership(id: string) {
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/committee', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          project_id: projectId,
          is_active: false,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('כהונה הסתיימה (ההיסטוריה נשמרה)')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'עדכון נכשל')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <LoadingSpinner />
      </div>
    )
  }

  if (missingTable) {
    return (
      <div style={styles.lockBox}>
        <p style={styles.lockTitle}>ועד הבית</p>
        <p style={styles.lockBody}>
          יש להחיל את המיגרציה{' '}
          <code>supabase/migrations/133_building_governance_wave4.sql</code> במסד (SQL Editor)
          ואז לרענן.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <p style={styles.intro}>
        חברי ועד ל־<strong>{projectName}</strong> — תפקידים וכהונה. סיום כהונה לא מוחק היסטוריה.
      </p>

      <form onSubmit={onAdd} style={styles.form}>
        <label style={styles.label}>
          שם מלא
          <input
            value={fullName}
            onChange={(ev) => setFullName(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
            maxLength={200}
            required
          />
        </label>
        <label style={styles.label}>
          תפקיד
          <select
            value={role}
            onChange={(ev) => setRole(ev.target.value as CommitteeRole)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          טלפון (אופציונלי)
          <input
            value={phone}
            onChange={(ev) => setPhone(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
            maxLength={40}
            inputMode="tel"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          style={isMobile ? styles.fullBtn : undefined}
        >
          {saving ? 'שומר…' : 'הוספת חבר ועד'}
        </Button>
      </form>

      {members.length === 0 ? (
        <p style={styles.empty}>אין עדיין חברי ועד לבניין זה</p>
      ) : (
        <div style={styles.list}>
          {members.map((m) => (
            <div key={m.id} style={styles.row}>
              <div
                style={{
                  ...styles.rowMain,
                  ...(isMobile ? styles.rowMainMobile : null),
                }}
              >
                <span style={styles.name}>{m.full_name}</span>
                <span style={styles.role}>{COMMITTEE_ROLE_LABELS_HE[m.role] || m.role}</span>
              </div>
              <div style={styles.meta}>
                {m.phone ? <span>{m.phone}</span> : null}
                {m.term_start || m.term_end ? (
                  <span>
                    כהונה: {m.term_start || '—'} → {m.term_end || 'פעיל'}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size={isMobile ? 'md' : 'sm'}
                disabled={saving}
                onClick={() => void endMembership(m.id)}
                style={isMobile ? styles.fullBtn : undefined}
              >
                סיום כהונה
              </Button>
            </div>
          ))}
        </div>
      )}

      <p style={styles.hint}>
        שלב הבא (Wave 4b): קישור אוטומטי לדיירים בפנקס + מורשי חתימה להחלטות.
      </p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: theme.spacing.lg },
  center: { display: 'flex', justifyContent: 'center', padding: 40 },
  intro: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  form: {
    display: 'grid',
    gap: 10,
    padding: theme.spacing.lg,
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
  },
  label: {
    display: 'grid',
    gap: 6,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontFamily: 'inherit',
    fontSize: theme.typography.fontSize.sm,
  },
  inputMobile: {
    fontSize: 16,
    minHeight: 48,
  },
  fullBtn: {
    width: '100%',
    minHeight: 48,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
  },
  rowMain: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  rowMainMobile: {
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start',
  },
  name: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.sm,
    wordBreak: 'break-word' as const,
    minWidth: 0,
  },
  role: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    flexShrink: 0,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  empty: {
    margin: 0,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    padding: '20px 0',
  },
  hint: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
  lockBox: {
    padding: theme.spacing.xl,
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px dashed ${theme.colors.borderStrong}`,
    textAlign: 'center',
  },
  lockTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  lockBody: {
    margin: '10px 0 0',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
}
