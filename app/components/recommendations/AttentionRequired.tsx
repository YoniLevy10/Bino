'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'
import { RecommendationAlertActions } from '@/app/components/recommendations/RecommendationAlertActions'
import { SuggestWorkerAssignButton } from '@/app/components/recommendations/SuggestWorkerAssignButton'

type Props = {
  /** Max cards on dashboard before "show all" */
  previewLimit?: number
}

function urgencyTone(u: string): { label: string; color: string; wash: string; border: string } {
  if (u === 'critical' || u === 'high') {
    return {
      label: u === 'critical' ? 'עכשיו' : 'דחוף',
      color: theme.colors.error,
      wash: theme.colors.errorMuted,
      border: theme.colors.error,
    }
  }
  if (u === 'medium') {
    return {
      label: 'היום',
      color: theme.colors.warning,
      wash: theme.colors.warningMuted,
      border: theme.colors.primary,
    }
  }
  return {
    label: 'נמוך',
    color: theme.colors.textMuted,
    wash: theme.colors.muted,
    border: theme.colors.border,
  }
}

/** Desktop dashboard card of focused alerts (ops briefing lives in the bell). */
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

  return (
    <Card
      title="מה צריך לקדם עכשיו"
      subtitle="מבוסס על כללי המערכת והמלצות קיימות בלבד"
      actions={
        hasMore ? (
          <button type="button" style={styles.showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'הצג פחות' : `הצג הכול (${rows.length})`}
          </button>
        ) : undefined
      }
      style={{ marginBottom: 24 }}
    >
      <div style={styles.grid}>
        {visible.map((row, index) => {
          const tone = urgencyTone(String(row.urgency))
          const highlighted = index === 0
          return (
            <div
              key={row.id}
              style={{
                ...styles.item,
                background: highlighted ? theme.colors.surface : theme.colors.mutedSurface,
                borderColor: highlighted ? theme.colors.primary : theme.colors.border,
                borderWidth: highlighted ? 1.25 : 1,
              }}
            >
              <div style={styles.meta}>
                <span style={{ ...styles.urgency, background: tone.wash, color: tone.color }}>
                  {tone.label}
                </span>
              </div>
              <p style={styles.reason}>{row.reason}</p>
              {row.entity_type === 'ticket' && row.entity_id ? (
                <div style={styles.actions}>
                  <SuggestWorkerAssignButton ticketId={row.entity_id} />
                </div>
              ) : null}
              <RecommendationAlertActions
                row={row}
                onDismissed={(id) => setRows((prev) => prev.filter((item) => item.id !== id))}
              />
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 12,
  },
  item: {
    padding: '18px 19px',
    borderRadius: theme.radius.lg,
    borderStyle: 'solid',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 140,
    transition: `border-color ${theme.motion.base} ease, background ${theme.motion.base} ease`,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  urgency: {
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: theme.radius.sm,
    lineHeight: 1.45,
  },
  reason: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 'auto',
  },
  showAll: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
}
