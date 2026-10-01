'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

type Props = {
  /** Max cards on dashboard before "show all" */
  previewLimit?: number
}

function urgencyLabel(u: string): string {
  if (u === 'critical') return 'דחוף'
  if (u === 'high') return 'גבוה'
  if (u === 'low') return 'נמוך'
  return 'בינוני'
}

/** Dashboard card of smart alerts — read-only (no action buttons). */
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
    <Card style={{ marginBottom: 16, borderColor: theme.colors.warning }}>
      <div style={styles.header}>
        <h3 style={styles.title}>דורש תשומת לב</h3>
        <span style={styles.count}>{rows.length}</span>
      </div>
      <div style={styles.list}>
        {visible.map((row) => (
          <div key={row.id} style={styles.item}>
            <div style={styles.meta}>
              <span style={styles.urgency}>{urgencyLabel(String(row.urgency))}</span>
            </div>
            <p style={styles.reason}>{row.reason}</p>
          </div>
        ))}
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
    background: theme.colors.warning,
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  item: {
    paddingBottom: 12,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  meta: { marginBottom: 4 },
  urgency: {
    fontSize: 11,
    fontWeight: 700,
    color: theme.colors.warning,
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
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
  },
}
