'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Button, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow, RecommendationAction } from '@/lib/recommendations/types'
import { parseActions } from '@/lib/recommendations/entitlements'

function urgencyLabel(u: string): string {
  if (u === 'critical') return 'דחוף'
  if (u === 'high') return 'גבוה'
  if (u === 'low') return 'נמוך'
  return 'בינוני'
}

function snoozeUntilHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

/**
 * Bell next to the mobile hamburger — opens management recommendations
 * ("דורש תשומת לב") in a viewport-fixed sheet (not a tiny absolute dropdown).
 */
export function RecommendationsBell() {
  const router = useRouter()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetchWithTimeout('/api/recommendations?limit=30')
      if (!res.ok) return
      const body = (await res.json()) as { recommendations?: ManagementRecommendationRow[] }
      setRows(body.recommendations ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    void load()
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function runAction(row: ManagementRecommendationRow, action: RecommendationAction) {
    if (busyId) return
    setBusyId(row.id)
    try {
      if (action.kind === 'snooze') {
        const res = await fetchWithTimeout('/api/recommendations/snooze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, until: snoozeUntilHours(24) }),
        })
        if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id))
        return
      }
      if (action.kind === 'dismiss') {
        const res = await fetchWithTimeout('/api/recommendations/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id }),
        })
        if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id))
        return
      }
      if (action.kind === 'set_follow_up') {
        const followUp = snoozeUntilHours(48)
        const res = await fetchWithTimeout('/api/recommendations/set-professional-follow-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_id: row.entity_id,
            follow_up_at: followUp,
            recommendation_id: row.id,
          }),
        })
        if (res.ok) {
          await fetchWithTimeout('/api/recommendations/snooze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, until: followUp }),
          })
          setRows((prev) => prev.filter((r) => r.id !== row.id))
        }
        return
      }

      const res = await fetchWithTimeout('/api/recommendations/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action_id: action.id }),
      })
      if (!res.ok) return
      const body = (await res.json()) as { href?: string | null }
      const href = body.href || action.href
      if (href) {
        setOpen(false)
        router.push(href)
      }
    } finally {
      setBusyId(null)
    }
  }

  const count = rows.length
  const showBadge = !loading && count > 0

  const sheet =
    open && mounted
      ? createPortal(
          <div style={styles.portalRoot}>
            <button
              type="button"
              style={styles.backdrop}
              aria-label="סגירת התראות"
              onClick={() => setOpen(false)}
            />
            <div
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label="דורש תשומת לב"
              style={styles.panel}
            >
              <div style={styles.panelHeader}>
                <div style={styles.panelTitleRow}>
                  <h3 style={styles.panelTitle}>דורש תשומת לב</h3>
                  {showBadge ? <span style={styles.panelCount}>{count}</span> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={styles.closeBtn}
                  aria-label="סגירה"
                >
                  ✕
                </button>
              </div>

              <div style={styles.panelBody}>
                {loading ? (
                  <p style={styles.empty}>טוען המלצות…</p>
                ) : count === 0 ? (
                  <p style={styles.empty}>אין התראות פעילות כרגע</p>
                ) : (
                  rows.map((row) => {
                    const all = parseActions(row.actions)
                    const actions = all.filter((a) => a.kind !== 'snooze' && a.kind !== 'dismiss')
                    const primary =
                      actions.find((a) => a.id === row.primary_action) || actions[0] || null
                    const snooze = all.find((a) => a.kind === 'snooze')
                    const dismiss = all.find((a) => a.kind === 'dismiss')
                    return (
                      <div key={row.id} style={styles.item}>
                        <span style={styles.urgency}>{urgencyLabel(String(row.urgency))}</span>
                        <p style={styles.reason}>{row.reason}</p>
                        <div style={styles.actions}>
                          {primary ? (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => void runAction(row, primary)}
                              style={styles.primaryBtn}
                            >
                              {primary.label}
                            </Button>
                          ) : null}
                          {(snooze || dismiss) && (
                            <div style={styles.secondaryRow}>
                              {snooze ? (
                                <button
                                  type="button"
                                  style={styles.textAction}
                                  disabled={busyId === row.id}
                                  onClick={() => void runAction(row, snooze)}
                                >
                                  הזכר לי מאוחר יותר
                                </button>
                              ) : null}
                              {dismiss ? (
                                <button
                                  type="button"
                                  style={styles.textActionMuted}
                                  disabled={busyId === row.id}
                                  onClick={() => void runAction(row, dismiss)}
                                >
                                  דחייה
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...styles.bellButton,
          ...(open ? styles.bellButtonOpen : null),
        }}
        aria-label={
          showBadge ? `התראות — ${count} דורשות תשומת לב` : 'התראות'
        }
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {showBadge ? (
          <span style={styles.badge}>{count > 99 ? '99+' : count}</span>
        ) : null}
      </button>
      {sheet}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: 'relative',
    flexShrink: 0,
  },
  bellButton: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.textSecondary,
    border: 'none',
    cursor: 'pointer',
  },
  bellButtonOpen: {
    background: theme.colors.surfaceHover,
    color: theme.colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 8,
    insetInlineEnd: 8,
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    borderRadius: 9,
    background: theme.colors.warning,
    color: theme.colors.textInverse,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: '18px',
    textAlign: 'center',
    boxShadow: `0 0 0 2px ${theme.colors.background}`,
  },
  portalRoot: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding:
      'calc(12px + env(safe-area-inset-top, 0px) + 64px) 12px calc(12px + env(safe-area-inset-bottom, 0px))',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    border: 'none',
    padding: 0,
    margin: 0,
    background: theme.colors.overlay,
    cursor: 'pointer',
    pointerEvents: 'auto',
  },
  panel: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    maxHeight: 'min(70vh, 520px)',
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.18)',
    overflow: 'hidden',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '14px 16px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    flexShrink: 0,
  },
  panelTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  panelTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  panelCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    background: theme.colors.warning,
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 7px',
    flexShrink: 0,
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.textMuted,
    fontSize: 14,
    cursor: 'pointer',
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  panelBody: {
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '4px 0',
    WebkitOverflowScrolling: 'touch',
    minHeight: 0,
    flex: 1,
  },
  empty: {
    margin: 0,
    padding: '28px 20px',
    textAlign: 'center',
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  item: {
    padding: '14px 16px',
    borderBottom: `1px solid ${theme.colors.border}`,
    boxSizing: 'border-box',
    minWidth: 0,
  },
  urgency: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    color: theme.colors.warning,
    marginBottom: 6,
  },
  reason: {
    margin: '0 0 12px',
    fontSize: 14,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    minWidth: 0,
  },
  primaryBtn: {
    width: '100%',
    whiteSpace: 'normal',
    textAlign: 'center',
    lineHeight: 1.3,
  },
  secondaryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 16px',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textAction: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 0',
    textAlign: 'center',
  },
  textActionMuted: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.textMuted,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 0',
    textAlign: 'center',
  },
}
