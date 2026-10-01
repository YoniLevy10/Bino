'use client'

import { useEffect, useId, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { theme } from '@/app/components/ui'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

function urgencyLabel(u: string): string {
  if (u === 'critical') return 'דחוף'
  if (u === 'high') return 'גבוה'
  if (u === 'low') return 'נמוך'
  return 'בינוני'
}

/**
 * Bell next to the mobile hamburger — opens management recommendations
 * ("דורש תשומת לב") as read-only smart alerts (no action buttons).
 */
export function RecommendationsBell() {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])
  const [loading, setLoading] = useState(true)

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
                  rows.map((row) => (
                    <div key={row.id} style={styles.item}>
                      <span style={styles.urgency}>{urgencyLabel(String(row.urgency))}</span>
                      <p style={styles.reason}>{row.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div style={styles.root}>
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
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
    overflowWrap: 'anywhere',
  },
}
