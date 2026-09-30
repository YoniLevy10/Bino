'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Card, Button, theme } from '@/app/components/ui'
import type { ManagementRecommendationRow, RecommendationAction } from '@/lib/recommendations/types'
import { parseActions } from '@/lib/recommendations/entitlements'

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

function snoozeUntilHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

export function AttentionRequired({ previewLimit = 3 }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
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
    void load()
  }, [])

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
          // Also snooze recommendation until follow-up
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
      if (href) router.push(href)
    } finally {
      setBusyId(null)
    }
  }

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
        {visible.map((row) => {
          const actions = parseActions(row.actions).filter((a) => a.kind !== 'snooze' && a.kind !== 'dismiss')
          const primary =
            actions.find((a) => a.id === row.primary_action) || actions[0] || null
          const snooze = parseActions(row.actions).find((a) => a.kind === 'snooze')
          const dismiss = parseActions(row.actions).find((a) => a.kind === 'dismiss')
          return (
            <div key={row.id} style={styles.item}>
              <div style={styles.meta}>
                <span style={styles.urgency}>{urgencyLabel(String(row.urgency))}</span>
              </div>
              <p style={styles.reason}>{row.reason}</p>
              <div style={styles.actions}>
                {primary ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row, primary)}
                  >
                    {primary.label}
                  </Button>
                ) : null}
                {snooze ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row, snooze)}
                  >
                    הזכר לי מאוחר יותר
                  </Button>
                ) : null}
                {dismiss ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row, dismiss)}
                  >
                    דחייה
                  </Button>
                ) : null}
              </div>
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
    margin: '0 0 10px',
    fontSize: 14,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
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
