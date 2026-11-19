'use client'

/**
 * Resident Approvals & signatures center («אישורים וחתימות»).
 * Pending / history / status sections; PDF view before sign; vote_choice.
 */

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { useSignaturePad } from '@/app/components/SignaturePad'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  residentTheme,
} from '@/app/components/resident/residentUi'
import {
  DECISION_STATUS_LABELS_HE,
  VOTE_CHOICE_LABELS_HE,
  type VoteChoice,
} from '@/lib/building-governance/roles'

type DecisionItem = {
  id: string
  title: string
  body: string | null
  status: string
  required_signatures: number
  signed_count: number
  approve_count: number
  oppose_count: number
  abstain_count: number
  majority_pct: number
  majority_reached: boolean
  majority_need?: number
  created_at: string
  closed_at: string | null
  document_id: string | null
  document: {
    id: string
    file_name: string
    mime_type: string | null
    file_size: number | null
  } | null
  my_signature: {
    id: string
    status: string
    signed_at: string | null
    vote_choice: VoteChoice | null
  } | null
  can_sign: boolean
  section: 'pending' | 'history' | 'status'
}

type SectionKey = 'pending' | 'history' | 'status'

const SECTION_LABELS: Record<SectionKey, string> = {
  pending: 'ממתינים',
  history: 'היסטוריה',
  status: 'סטטוס',
}

function DecisionsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('decision')?.trim() || null
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decisions, setDecisions] = useState<DecisionItem[]>([])
  const [section, setSection] = useState<SectionKey>('pending')
  const [activeId, setActiveId] = useState<string | null>(focusId)
  const [submitting, setSubmitting] = useState(false)
  const [signError, setSignError] = useState('')
  const [voteChoice, setVoteChoice] = useState<VoteChoice>('approve')
  const [openingPdf, setOpeningPdf] = useState(false)
  const activeIdRef = useRef<string | null>(focusId)
  const loadGenRef = useRef(0)
  const signCardRef = useRef<HTMLDivElement>(null)

  const canvasHeight = isMobile ? 220 : 200
  const pad = useSignaturePad({
    height: canvasHeight,
    disabled: submitting,
    strokeWidth: isMobile ? 2.5 : 2,
  })

  function selectDecision(id: string) {
    setActiveId(id)
    setSignError('')
    setVoteChoice('approve')
    pad.clear()
    window.requestAnimationFrame(() => {
      signCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithTimeout('/api/resident/decisions')
      if (gen !== loadGenRef.current) return
      const json = (await res.json()) as {
        decisions?: DecisionItem[]
        error?: string
        code?: string
      }
      if (res.status === 401) {
        router.replace('/resident/login?redirectTo=/resident/decisions')
        setError('נדרשת התחברות לפורטל הדיירים')
        setDecisions([])
        return
      }
      if (res.status === 403) {
        setError(
          json.error ||
            'אין חברות פעילה בפורטל — התחברו מחדש דרך /resident/demo או קישור הבניין'
        )
        setDecisions([])
        return
      }
      if (res.status === 409 && json.code === 'MEMBERSHIP_PICKER_REQUIRED') {
        setError('יש לבחור דירה פעילה בתפריט למעלה ואז לרענן')
        setDecisions([])
        return
      }
      if (!res.ok) {
        throw new Error(json.error || `שגיאה ${res.status}`)
      }
      const list = json.decisions ?? []
      setDecisions(list)

      const focused = focusId ? list.find((d) => d.id === focusId) : null
      if (focused) {
        setActiveId(focused.id)
        setSection(focused.section)
      } else if (!activeIdRef.current && list.length > 0) {
        const open = list.find((d) => d.can_sign) || list[0]
        setActiveId(open.id)
        setSection(open.section)
      } else if (list.some((d) => d.can_sign)) {
        setSection('pending')
      } else if (list.some((d) => d.section === 'history')) {
        setSection('history')
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return
      setError(e instanceof Error ? e.message : 'טעינה נכשלה')
      setDecisions([])
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }, [focusId, router])

  useEffect(() => {
    void load()
    return () => {
      loadGenRef.current += 1
    }
  }, [load])

  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => {
      setLoading(false)
      setError((prev) => prev || 'הטעינה ארכה יותר מדי — רעננו את הדף או התחברו מחדש')
    }, 20_000)
    return () => window.clearTimeout(t)
  }, [loading])

  const sectionList = decisions.filter((d) => d.section === section)
  const active =
    decisions.find((d) => d.id === activeId) ||
    sectionList[0] ||
    null

  async function openPdf(decision: DecisionItem) {
    if (!decision.document_id) return
    setOpeningPdf(true)
    setSignError('')
    try {
      const res = await fetchWithTimeout(
        `/api/resident/decisions/${encodeURIComponent(decision.id)}/document`,
        { method: 'POST' },
        20_000
      )
      const json = (await res.json()) as { url?: string; error?: string }
      if (res.status === 401) {
        router.replace('/resident/login?redirectTo=/resident/decisions')
        throw new Error('נדרשת התחברות לפורטל הדיירים')
      }
      if (!res.ok || !json.url) throw new Error(json.error || 'פתיחת המסמך נכשלה')
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'פתיחת המסמך נכשלה')
    } finally {
      setOpeningPdf(false)
    }
  }

  async function submitSign() {
    if (!active || !active.can_sign) return
    if (pad.isBlank()) {
      setSignError('נא לחתום על הלוח לפני שליחה')
      return
    }
    setSubmitting(true)
    setSignError('')
    try {
      const res = await fetchWithTimeout(
        `/api/resident/decisions/${encodeURIComponent(active.id)}/sign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_data_url: pad.toDataURL('image/png'),
            vote_choice: voteChoice,
          }),
        },
        30_000
      )
      const json = (await res.json()) as { error?: string; ok?: boolean }
      if (res.status === 401) {
        router.replace('/resident/login?redirectTo=/resident/decisions')
        throw new Error('נדרשת התחברות לפורטל הדיירים')
      }
      if (!res.ok) throw new Error(json.error || `שגיאה ${res.status}`)
      pad.clear()
      await load()
      setSection('history')
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <ResidentMuted>טוען אישורים…</ResidentMuted>
  if (error) {
    return (
      <div style={{ display: 'grid', gap: 12 }} dir="rtl">
        <ResidentAlert tone="error">{error}</ResidentAlert>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <ResidentPrimaryButton type="button" onClick={() => void load()}>
            נסו שוב
          </ResidentPrimaryButton>
          <ResidentPrimaryButton
            type="button"
            onClick={() => {
              window.location.href = '/resident/demo'
            }}
            style={{ background: residentTheme.colors.surface, color: residentTheme.colors.textPrimary }}
          >
            כניסת QA מחדש
          </ResidentPrimaryButton>
        </div>
      </div>
    )
  }

  const pendingCount = decisions.filter((d) => d.section === 'pending').length
  const historyCount = decisions.filter((d) => d.section === 'history').length
  const statusCount = decisions.filter((d) => d.section === 'status').length

  if (decisions.length === 0) {
    return (
      <ResidentCard>
        <ResidentSectionTitle>אישורים וחתימות</ResidentSectionTitle>
        <ResidentMuted style={{ marginTop: 8 }}>
          אין כרגע בקשות אישור או חתימה בבניין שלכם.
        </ResidentMuted>
      </ResidentCard>
    )
  }

  return (
    <div className="resident-decisions" dir="rtl">
      <div className="resident-decisions-intro">
        <ResidentSectionTitle>אישורים וחתימות</ResidentSectionTitle>
        <ResidentMuted style={{ margin: 0 }}>
          צפו במסמך, בחרו בעד / נגד / נמנע, וחתמו באזור האישי.
        </ResidentMuted>
      </div>

      <div className="resident-approvals-tabs" role="tablist" aria-label="מקטעי אישורים">
        {(['pending', 'history', 'status'] as const).map((key) => {
          const count =
            key === 'pending' ? pendingCount : key === 'history' ? historyCount : statusCount
          const selected = section === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setSection(key)
                const first = decisions.find((d) => d.section === key)
                if (first) selectDecision(first.id)
              }}
              style={{
                ...styles.tab,
                ...(selected ? styles.tabActive : null),
              }}
            >
              {SECTION_LABELS[key]}
              <span style={styles.tabCount}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="resident-decisions-layout">
        {active && active.section === section ? (
          <ResidentCard
            ref={signCardRef}
            className="resident-decisions-sign-card"
            style={{ padding: isMobile ? '16px 14px' : '18px 16px' }}
          >
            <h2 style={styles.detailTitle}>{active.title}</h2>
            {active.body ? <p style={styles.body}>{active.body}</p> : null}
            <p style={styles.progress}>
              בעד: {active.approve_count}/{active.required_signatures}
              {typeof active.majority_need === 'number'
                ? ` (נדרש ${active.majority_need})`
                : ''}{' '}
              · נגד: {active.oppose_count} · נמנע: {active.abstain_count}
              {active.majority_reached ? ' · הושג רוב' : ''}
            </p>
            <p style={styles.statusLine}>
              סטטוס: {DECISION_STATUS_LABELS_HE[active.status] || active.status}
            </p>

            {active.document ? (
              <div style={styles.pdfRow}>
                <ResidentMuted style={{ margin: 0 }}>
                  מסמך: {active.document.file_name}
                </ResidentMuted>
                <button
                  type="button"
                  onClick={() => void openPdf(active)}
                  disabled={openingPdf}
                  style={styles.secondaryBtn}
                >
                  {openingPdf ? 'פותח…' : 'צפייה ב־PDF'}
                </button>
              </div>
            ) : null}

            {active.my_signature?.status === 'signed' ? (
              <ResidentAlert tone="info">
                ההצבעה שלכם נקלטה
                {active.my_signature.vote_choice
                  ? ` (${VOTE_CHOICE_LABELS_HE[active.my_signature.vote_choice]})`
                  : ''}
                . תודה.
              </ResidentAlert>
            ) : active.can_sign ? (
              <>
                <fieldset style={styles.voteFieldset}>
                  <legend style={styles.voteLegend}>בחירת הצבעה</legend>
                  <div style={styles.voteRow}>
                    {(['approve', 'oppose', 'abstain'] as const).map((choice) => (
                      <label key={choice} style={styles.voteLabel}>
                        <input
                          type="radio"
                          name="vote_choice"
                          value={choice}
                          checked={voteChoice === choice}
                          onChange={() => setVoteChoice(choice)}
                        />
                        <span>{VOTE_CHOICE_LABELS_HE[choice]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p style={styles.hint}>חתמו באצבע בתוך המסגרת:</p>
                <div className="resident-decisions-pad" style={styles.canvasWrap}>
                  <canvas
                    {...pad.canvasProps}
                    style={{ ...pad.canvasProps.style, ...styles.canvas }}
                  />
                </div>
                {signError ? (
                  <div style={{ marginTop: 10 }}>
                    <ResidentAlert tone="error">{signError}</ResidentAlert>
                  </div>
                ) : null}
                <div
                  className="resident-decisions-actions"
                  style={{
                    ...styles.actions,
                    ...(isMobile ? styles.actionsMobile : null),
                  }}
                >
                  <button type="button" onClick={() => pad.clear()} style={styles.secondaryBtn}>
                    ניקוי
                  </button>
                  <ResidentPrimaryButton
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitSign()}
                    style={isMobile ? { width: '100%' } : { flex: 1, width: 'auto' }}
                  >
                    {submitting ? 'שולח…' : 'אישור חתימה'}
                  </ResidentPrimaryButton>
                </div>
              </>
            ) : (
              <ResidentMuted>
                {signError || 'ההחלטה אינה פתוחה לחתימה כרגע.'}
              </ResidentMuted>
            )}
          </ResidentCard>
        ) : (
          <ResidentCard>
            <ResidentMuted>
              {section === 'pending'
                ? 'אין אישורים ממתינים כרגע.'
                : section === 'history'
                  ? 'אין היסטוריית הצבעות עדיין.'
                  : 'אין פריטי סטטוס נוספים.'}
            </ResidentMuted>
          </ResidentCard>
        )}

        <div
          className="resident-decisions-list"
          style={styles.list}
          role="listbox"
          aria-label={SECTION_LABELS[section]}
        >
          {sectionList.map((d) => {
            const selected = d.id === active?.id
            return (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectDecision(d.id)}
                style={{
                  ...styles.item,
                  ...(selected ? styles.itemActive : null),
                }}
              >
                <span style={styles.itemTitle}>{d.title}</span>
                <span style={styles.itemMeta}>
                  {DECISION_STATUS_LABELS_HE[d.status] || d.status}
                  {d.my_signature?.status === 'signed'
                    ? ` · ${d.my_signature.vote_choice ? VOTE_CHOICE_LABELS_HE[d.my_signature.vote_choice] : 'נחתם'}`
                    : d.can_sign
                      ? ' · ממתין לחתימה'
                      : ''}
                  {d.document ? ' · PDF' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ResidentDecisionsPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl">
          <ResidentMuted>טוען…</ResidentMuted>
        </div>
      }
    >
      <DecisionsInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: residentTheme.radius.md,
    border: `1px solid ${residentTheme.colors.border}`,
    background: residentTheme.colors.surface,
    color: residentTheme.colors.textSecondary,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: {
    borderColor: residentTheme.colors.primary,
    color: residentTheme.colors.textPrimary,
    boxShadow: `0 0 0 1px ${residentTheme.colors.primary}`,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: 700,
    color: residentTheme.colors.textMuted,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    textAlign: 'right',
    padding: '12px 14px',
    borderRadius: residentTheme.radius.lg,
    border: `1px solid ${residentTheme.colors.border}`,
    background: residentTheme.colors.surface,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'grid',
    gap: 4,
  },
  itemActive: {
    borderColor: residentTheme.colors.primary,
    boxShadow: `0 0 0 1px ${residentTheme.colors.primary}`,
  },
  itemTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: residentTheme.colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: residentTheme.colors.textMuted,
  },
  detailTitle: {
    margin: '0 0 8px',
    fontSize: 18,
    fontWeight: 700,
    color: residentTheme.colors.textPrimary,
    lineHeight: 1.35,
  },
  body: {
    margin: '0 0 10px',
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: residentTheme.colors.textSecondary,
  },
  progress: {
    margin: '0 0 6px',
    fontSize: 13,
    color: residentTheme.colors.textMuted,
  },
  statusLine: {
    margin: '0 0 12px',
    fontSize: 13,
    color: residentTheme.colors.textSecondary,
  },
  pdfRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  voteFieldset: {
    border: `1px solid ${residentTheme.colors.border}`,
    borderRadius: residentTheme.radius.md,
    padding: '10px 12px',
    margin: '0 0 12px',
  },
  voteLegend: {
    fontSize: 13,
    fontWeight: 600,
    color: residentTheme.colors.textMuted,
    paddingInline: 4,
  },
  voteRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  voteLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 15,
    fontWeight: 600,
    color: residentTheme.colors.textPrimary,
    cursor: 'pointer',
  },
  hint: {
    margin: '0 0 8px',
    fontSize: 13,
    color: residentTheme.colors.textMuted,
  },
  canvasWrap: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    borderRadius: residentTheme.radius.md,
    overflow: 'hidden',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  canvas: {
    boxSizing: 'border-box',
    maxWidth: '100%',
    borderRadius: residentTheme.radius.md,
    border: `2px solid ${residentTheme.colors.border}`,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
    alignItems: 'stretch',
    flexWrap: 'wrap',
    width: '100%',
  },
  actionsMobile: {
    flexDirection: 'column-reverse',
  },
  secondaryBtn: {
    minHeight: 48,
    padding: '0 16px',
    borderRadius: residentTheme.radius.md,
    border: `1px solid ${residentTheme.colors.border}`,
    background: residentTheme.colors.surface,
    color: residentTheme.colors.textPrimary,
    fontWeight: 600,
    fontSize: 16,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
