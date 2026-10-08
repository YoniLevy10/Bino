'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import { RecommendationAlertActions } from '@/app/components/recommendations/RecommendationAlertActions'

type Props = {
  /** Max cards on dashboard before "show all" */
  previewLimit?: number
}

function urgencyTone(u: string): { label: string; color: string; wash: string } {
  if (u === 'critical' || u === 'high') {
    return { label: u === 'critical' ? 'עכשיו' : 'דחוף', color: theme.colors.error, wash: theme.colors.errorMuted }
  }
  if (u === 'medium') {
    return { label: 'היום', color: theme.colors.warning, wash: theme.colors.warningMuted }
  }
  return { label: 'נמוך', color: theme.colors.textMuted, wash: theme.colors.muted }
}

/** Dashboard card of smart alerts — open the relevant screen or dismiss. */
export function AttentionRequired({ previewLimit = 3 }: Props) {
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

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
    void load()
  }, [])

  if (loading || rows.length === 0) return null

  const visible = showAll ? rows : rows.slice(0, previewLimit)
  const hasMore = rows.length > previewLimit
  const lead = urgencyTone(String(visible[0]?.urgency || rows[0]?.urgency || 'medium'))

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={styles.header}>
        <h3 style={styles.title}>דורש תשומת לב</h3>
        <span style={{ ...styles.count, background: lead.color }}>{rows.length}</span>
      </div>
      <div style={styles.list}>
        {visible.map((row) => {
          const tone = urgencyTone(String(row.urgency))
          return (
            <div
              key={row.id}
              style={{
                ...styles.item,
                borderInlineStart: `3px solid ${tone.color}`,
                background: tone.wash,
              }}
            >
              <div style={styles.meta}>
                <span style={{ ...styles.urgency, color: tone.color }}>{tone.label}</span>
              </div>
              <p style={styles.reason}>{row.reason}</p>
              <RecommendationAlertActions
                row={row}
                onDismissed={(id) => setRows((prev) => prev.filter((item) => item.id !== id))}
              />
            </div>
          )
        })}
      </div>
      {hasMore ? (
        <button type="button" style={styles.showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'הצג פחות' : `הצג הכול (${rows.length})`}
        </button>
      ) : null}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  count: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    padding: '10px 12px',
    borderRadius: theme.radius.sm,
    borderBottom: 'none',
  },
  meta: { marginBottom: 4 },
  urgency: {
    fontSize: 11,
    fontWeight: 700,
  },
  reason: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
  },
  showAll: {
    marginTop: 8,
    border: 'none',
    background: 'transparent',
    color: theme.colors.textSecondary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
  },
}
