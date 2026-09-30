'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Button, theme } from '@/app/components/ui'
import type { EntityType, ManagementRecommendationRow } from '@/lib/recommendations/types'
import { parseActions } from '@/lib/recommendations/entitlements'

type Props = {
  entityType: EntityType
  entityId: string
}

export function EntityRecommendations({ entityType, entityId }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ManagementRecommendationRow[]>([])

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchWithTimeout(
          `/api/recommendations?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=5`
        )
        if (!res.ok || cancelled) return
        const body = (await res.json()) as { recommendations?: ManagementRecommendationRow[] }
        if (!cancelled) setRows(body.recommendations ?? [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  if (!rows.length) return null

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>המלצות לישות זו</div>
      {rows.map((row) => {
        const actions = parseActions(row.actions)
        const primary = actions.find((a) => a.id === row.primary_action) || actions[0]
        return (
          <div key={row.id} style={styles.item}>
            <p style={styles.reason}>{row.reason}</p>
            {primary?.href ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void fetchWithTimeout('/api/recommendations/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: row.id, action_id: primary.id }),
                  }).finally(() => {
                    if (primary.href) router.push(primary.href)
                  })
                }}
              >
                {primary.label}
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.border}`,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    color: theme.colors.textPrimary,
  },
  item: { marginBottom: 8 },
  reason: {
    margin: '0 0 8px',
    fontSize: 13,
    lineHeight: 1.4,
    color: theme.colors.textSecondary,
  },
}
