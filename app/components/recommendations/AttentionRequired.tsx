'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import type { OpsBriefing } from '@/lib/ops-context/synthesize-briefing'
import { RecommendationAlertActions } from '@/app/components/recommendations/RecommendationAlertActions'

type Props = {
  /** Max cards on dashboard before "show all" */
  previewLimit?: number
}

function urgencyTone(u: string): { label: string; color: string; wash: string } {
  if (u === 'critical' || u === 'high') {
    return {
      label: u === 'critical' ? 'עכשיו' : 'דחוף',
      color: theme.colors.error,
      wash: theme.colors.errorMuted,
    }
  }
  if (u === 'medium') {
    return { label: 'היום', color: theme.colors.warning, wash: theme.colors.warningMuted }
  }
  return { label: 'נמוך', color: theme.colors.textMuted, wash: theme.colors.muted }
}

/** Dashboard card: cross-page ops conclusion + smart alerts. */
export function AttentionRequired({ previewLimit = 3 }: Props) {
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])
  const [briefing, setBriefing] = useState<OpsBriefing | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  async function load() {
    try {
      const res = await fetchWithTimeout('/api/recommendations?limit=30')
      if (!res.ok) return
      const body = (await res.json()) as {
        recommendations?: ManagementRecommendationRow[]
        briefing?: OpsBriefing | null
      }
      setRows(body.recommendations ?? [])
      setBriefing(body.briefing ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return null
  if (!briefing && rows.length === 0) return null

  const visible = showAll ? rows : rows.slice(0, previewLimit)
  const hasMore = rows.length > previewLimit
  const leadUrgency = String(
    briefing?.priorities[0]?.urgency || visible[0]?.urgency || rows[0]?.urgency || 'medium'
  )
  const lead = urgencyTone(leadUrgency)

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={styles.header}>
        <h3 style={styles.title}>תמונת מצב תפעולית</h3>
        {rows.length > 0 ? (
          <span style={{ ...styles.count, background: lead.color }}>{rows.length}</span>
        ) : null}
      </div>

      {briefing ? (
        <div
          style={{
            ...styles.briefing,
            borderInlineStart: `3px solid ${briefing.quiet ? theme.colors.success : lead.color}`,
            background: briefing.quiet ? theme.colors.successMuted || '#f0fdf4' : lead.wash,
          }}
        >
          <div style={{ ...styles.urgency, color: briefing.quiet ? theme.colors.success : lead.color }}>
            מסקנה מכל המסכים
          </div>
          <p style={styles.headline}>{briefing.headline}</p>
          <p style={styles.summary}>{briefing.summary}</p>
          {briefing.priorities.length > 0 ? (
            <div style={styles.priorityList}>
              {briefing.priorities.map((p) => (
                <Link key={`${p.domain}-${p.href}-${p.label}`} href={p.href} style={styles.priorityLink}>
                  {p.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div style={styles.subHeader}>המלצות ממוקדות</div>
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
        </>
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
  briefing: {
    padding: '12px 14px',
    borderRadius: theme.radius.sm,
    marginBottom: 12,
  },
  headline: {
    margin: '4px 0 0',
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.4,
    color: theme.colors.textPrimary,
  },
  summary: {
    margin: '6px 0 0',
    fontSize: 13,
    lineHeight: 1.5,
    color: theme.colors.textSecondary,
  },
  priorityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 10,
  },
  priorityLink: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  subHeader: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textMuted,
    marginBottom: 8,
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
