'use client'

/**
 * Resident personal area — open building decisions + signature pad.
 * Auth: phone + SMS OTP password via /resident/join/{projectId}.
 */

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useSignaturePad } from '@/app/components/SignaturePad'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  residentTheme,
} from '@/app/components/resident/residentUi'
import { DECISION_STATUS_LABELS_HE } from '@/lib/building-governance/roles'

type DecisionItem = {
  id: string
  title: string
  body: string | null
  status: string
  required_signatures: number
  signed_count: number
  majority_pct: number
  majority_reached: boolean
  created_at: string
  my_signature: { id: string; status: string; signed_at: string | null } | null
  can_sign: boolean
}

function DecisionsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('decision')?.trim() || null
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decisions, setDecisions] = useState<DecisionItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(focusId)
  const [submitting, setSubmitting] = useState(false)
  const [signError, setSignError] = useState('')
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
    pad.clear()
    // Keep the signature card in view under the sticky header / above the tabbar.
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
      const list = [...(json.decisions ?? [])].sort((a, b) => {
        const ap = a.can_sign ? 0 : a.my_signature?.status === 'signed' ? 2 : 1
        const bp = b.can_sign ? 0 : b.my_signature?.status === 'signed' ? 2 : 1
        return ap - bp
      })
      setDecisions(list)
      if (focusId && list.some((d) => d.id === focusId)) {
        setActiveId(focusId)
      } else if (!activeIdRef.current && list.length > 0) {
        const open = list.find((d) => d.can_sign) || list[0]
        setActiveId(open.id)
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
      // Invalidate in-flight response handlers on unmount / focus change.
      loadGenRef.current += 1
    }
  }, [load])

  // Hard stop: never leave the UI on «טוען החלטות…» forever.
  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => {
      setLoading(false)
      setError((prev) => prev || 'הטעינה ארכה יותר מדי — רעננו את הדף או התחברו מחדש')
    }, 20_000)
    return () => window.clearTimeout(t)
  }, [loading])

  const active = decisions.find((d) => d.id === activeId) || null

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
          body: JSON.stringify({ signature_data_url: pad.toDataURL('image/png') }),
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
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <ResidentMuted>טוען החלטות…</ResidentMuted>
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

  if (decisions.length === 0) {
    return (
      <ResidentCard>
        <ResidentSectionTitle>החלטות בניין</ResidentSectionTitle>
        <ResidentMuted style={{ marginTop: 8 }}>
          אין כרגע החלטות פתוחות לחתימה בבניין שלכם.
        </ResidentMuted>
      </ResidentCard>
    )
  }

  return (
    <div className="resident-decisions" dir="rtl">
      <div className="resident-decisions-intro">
        <ResidentSectionTitle>החלטות לחתימה</ResidentSectionTitle>
        <ResidentMuted style={{ margin: 0 }}>
          בחרו החלטה, קראו את הפירוט וחתמו באצבע באזור האישי.
        </ResidentMuted>
      </div>

      <div className="resident-decisions-layout">
        {/* Sign card first in DOM so it sits at the top of the page flow (list follows
            on mobile; desktop CSS places list in a side column). */}
        {active ? (
          <ResidentCard
            ref={signCardRef}
            className="resident-decisions-sign-card"
            style={{ padding: isMobile ? '16px 14px' : '18px 16px' }}
          >
            <h2 style={styles.detailTitle}>{active.title}</h2>
            {active.body ? <p style={styles.body}>{active.body}</p> : null}
            <p style={styles.progress}>
              חתימות: {active.signed_count}/{active.required_signatures} · התקדמות:{' '}
              {active.majority_pct}%
              {active.majority_reached ? ' · הושג רוב' : ''}
            </p>

            {active.my_signature?.status === 'signed' ? (
              <ResidentAlert tone="info">החתימה שלכם נקלטה. תודה.</ResidentAlert>
            ) : active.can_sign ? (
              <>
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
              <ResidentMuted>ההחלטה אינה פתוחה לחתימה כרגע.</ResidentMuted>
            )}
          </ResidentCard>
        ) : null}

        <div className="resident-decisions-list" style={styles.list} role="listbox" aria-label="רשימת החלטות">
          {decisions.map((d) => {
            const selected = d.id === activeId
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
                    ? ' · נחתם על ידכם'
                    : d.can_sign
                      ? ' · ממתין לחתימה'
                      : ''}
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
    margin: '0 0 14px',
    fontSize: 13,
    color: residentTheme.colors.textMuted,
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
