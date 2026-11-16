'use client'

/**
 * Building Hub — החלטות tab (Wave 4).
 * Create/list decisions + signature request links; majority auto-passes via public sign API.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { DECISION_STATUS_LABELS_HE } from '@/lib/building-governance/roles'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'

type SignatureRequest = {
  id: string
  signer_name: string
  signer_phone: string | null
  status: string
  signed_at: string | null
  sign_path: string
  /** @deprecated prefer sign_path + client origin */
  sign_url?: string
}

function absoluteSignUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  if (typeof window !== 'undefined') return `${window.location.origin}${pathOrUrl}`
  return pathOrUrl
}

type Decision = {
  id: string
  title: string
  body: string | null
  status: string
  majority_threshold: number
  required_signatures: number
  signed_count: number
  majority_reached: boolean
  majority_pct: number
  created_at: string
  signature_requests: SignatureRequest[]
}

type Props = {
  projectId: string
  projectName: string
  isMobile?: boolean
}

export function BuildingDecisionsPanel({
  projectId,
  projectName,
  isMobile: isMobileProp,
}: Props) {
  const [viewportMobile, setViewportMobile] = useState(false)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [required, setRequired] = useState('2')
  const [signerName, setSignerName] = useState('')
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null)

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
        `/api/building-governance/decisions?project_id=${encodeURIComponent(projectId)}`
      )
      const json = (await res.json()) as { decisions?: Decision[]; error?: string }
      if (!res.ok) {
        const msg = errorMessageFromResponseJson(json, `שגיאה ${res.status}`)
        if (/relation|does not exist|schema cache|building_decision/i.test(msg)) {
          setMissingTable(true)
          setDecisions([])
          return
        }
        throw new Error(msg)
      }
      setDecisions(json.decisions ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת החלטות נכשלה')
      setDecisions([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('נא להזין כותרת החלטה')
      return
    }
    const reqN = Math.max(1, Math.min(500, Number(required) || 1))
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          body: body.trim() || null,
          required_signatures: reqN,
          majority_threshold: 0.5,
          status: 'open',
        }),
      })
      const json = (await res.json()) as { error?: string; decision?: { id: string } }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('החלטה נוצרה')
      setTitle('')
      setBody('')
      setActiveDecisionId(json.decision?.id ?? null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'יצירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function addSigner(decisionId: string) {
    if (!signerName.trim()) {
      toast.error('נא להזין שם חותם')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/building-governance/decisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: decisionId,
          signer_name: signerName.trim(),
        }),
      })
      const json = (await res.json()) as { error?: string; sign_path?: string; sign_url?: string }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      const link = json.sign_path
        ? absoluteSignUrl(json.sign_path)
        : json.sign_url
          ? absoluteSignUrl(json.sign_url)
          : null
      if (link) {
        try {
          await navigator.clipboard.writeText(link)
          toast.success('קישור חתימה נוצר והועתק')
        } catch {
          toast.success('קישור חתימה נוצר')
        }
      }
      setSignerName('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'יצירת קישור נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('הקישור הועתק')
    } catch {
      toast.error('העתקה נכשלה')
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
        <p style={styles.lockTitle}>החלטות וחתימות</p>
        <p style={styles.lockBody}>
          יש להחיל את המיגרציה{' '}
          <code>supabase/migrations/133_building_governance_wave4.sql</code> במסד ואז לרענן.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <p style={styles.intro}>
        החלטות ל־<strong>{projectName}</strong> — קישור חתימה לכל חותם; ברוב → «אושרה».
      </p>

      <form onSubmit={onCreate} style={styles.form}>
        <label style={styles.label}>
          כותרת ההחלטה
          <input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
            maxLength={300}
            required
          />
        </label>
        <label style={styles.label}>
          פירוט (אופציונלי)
          <textarea
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            style={{
              ...styles.input,
              minHeight: 72,
              resize: 'vertical',
              ...(isMobile ? styles.inputMobile : null),
            }}
            maxLength={8000}
          />
        </label>
        <label style={styles.label}>
          מספר חתימות נדרש (לרוב)
          <input
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            value={required}
            onChange={(ev) => setRequired(ev.target.value)}
            style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          style={isMobile ? styles.fullBtn : undefined}
        >
          {saving ? 'שומר…' : 'יצירת החלטה'}
        </Button>
      </form>

      {decisions.length === 0 ? (
        <p style={styles.empty}>אין עדיין החלטות — צרו את הראשונה למעלה</p>
      ) : (
        <div style={styles.list}>
          {decisions.map((d) => (
            <div key={d.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.cardTitle}>{d.title}</span>
                <span style={styles.status}>
                  {DECISION_STATUS_LABELS_HE[d.status] || d.status}
                </span>
              </div>
              {d.body ? <p style={styles.bodyText}>{d.body}</p> : null}
              <p style={styles.progress}>
                חתימות: {d.signed_count}/{d.required_signatures} · התקדמות לרוב:{' '}
                {d.majority_pct}%
                {d.majority_reached ? ' · הושג רוב' : ''}
              </p>

              {(d.signature_requests || []).length > 0 ? (
                <div style={styles.sigList}>
                  {d.signature_requests.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        ...styles.sigRow,
                        ...(isMobile ? styles.sigRowMobile : null),
                      }}
                    >
                      <span style={styles.sigName}>
                        {s.signer_name} —{' '}
                        {s.status === 'signed'
                          ? 'נחתם'
                          : s.status === 'pending'
                            ? 'ממתין'
                            : s.status}
                      </span>
                      {s.status === 'pending' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size={isMobile ? 'md' : 'sm'}
                          onClick={() =>
                            void copyUrl(absoluteSignUrl(s.sign_path || s.sign_url || ''))
                          }
                          style={isMobile ? styles.fullBtn : undefined}
                        >
                          העתקת קישור
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {(d.status === 'open' || d.status === 'draft') && (
                <div
                  style={{
                    ...styles.addSigner,
                    ...(isMobile ? styles.addSignerMobile : null),
                  }}
                >
                  <input
                    value={activeDecisionId === d.id ? signerName : ''}
                    onFocus={() => setActiveDecisionId(d.id)}
                    onChange={(ev) => {
                      setActiveDecisionId(d.id)
                      setSignerName(ev.target.value)
                    }}
                    placeholder="שם החותם"
                    style={{ ...styles.input, ...(isMobile ? styles.inputMobile : null) }}
                    maxLength={200}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size={isMobile ? 'md' : 'sm'}
                    disabled={saving || activeDecisionId !== d.id}
                    onClick={() => void addSigner(d.id)}
                    style={isMobile ? styles.fullBtn : undefined}
                  >
                    קישור חתימה
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 14px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  cardTitle: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.sm,
    wordBreak: 'break-word' as const,
    minWidth: 0,
    flex: 1,
  },
  status: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    whiteSpace: 'nowrap',
  },
  bodyText: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
  progress: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  sigList: { display: 'flex', flexDirection: 'column', gap: 4 },
  sigRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  sigRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  sigName: {
    wordBreak: 'break-word' as const,
    minWidth: 0,
  },
  addSigner: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addSignerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  empty: {
    margin: 0,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    padding: '16px 0',
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
