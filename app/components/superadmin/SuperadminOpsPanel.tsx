'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { OpsFailuresPanel, type OpsFeed } from './OpsFailuresPanel'
import { theme } from '../ui'

type Props = {
  adminSecret: string
  onCountsChange?: (counts: OpsFeed['counts']) => void
}

export function SuperadminOpsPanel({ adminSecret, onCountsChange }: Props) {
  const [opsFeed, setOpsFeed] = useState<OpsFeed | null>(null)
  const [opsLoading, setOpsLoading] = useState(true)
  const [opsError, setOpsError] = useState('')
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())

  const loadOpsFeed = useCallback(async () => {
    setOpsLoading(true)
    setOpsError('')
    try {
      const res = await fetchWithTimeout('/api/superadmin/ops-feed?limit=50', {
        headers: { 'x-admin-secret': adminSecret },
      })
      const json = await res.json() as OpsFeed & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      const feed = {
        failed_notifications: json.failed_notifications ?? [],
        error_logs: json.error_logs ?? [],
        counts: json.counts ?? {
          failed_notifications: 0,
          error_logs: 0,
          unresolved_errors: 0,
        },
      }
      setOpsFeed(feed)
      onCountsChange?.(feed.counts)
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setOpsLoading(false)
    }
  }, [adminSecret, onCountsChange])

  useEffect(() => {
    void loadOpsFeed()
  }, [loadOpsFeed])

  async function resolveError(id: string) {
    setResolvingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetchWithTimeout(`/api/superadmin/error-logs/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'x-admin-secret': adminSecret },
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setOpsFeed((prev) => {
        if (!prev) return prev
        const error_logs = prev.error_logs.map((row) =>
          row.id === id ? { ...row, resolved: true } : row
        )
        const unresolved_errors = error_logs.filter((r) => !r.resolved).length
        const counts = { ...prev.counts, unresolved_errors }
        onCountsChange?.(counts)
        return { ...prev, error_logs, counts }
      })
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : 'סימון נכשל')
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <p className="sa-ops-toolbar-text" style={styles.toolbarText}>
          כשלונות SMS/WhatsApp ושגיאות אחרונות — ניתן לסמן שגיאות כטופלות מהטלפון.
        </p>
        <button
          type="button"
          onClick={() => void loadOpsFeed()}
          disabled={opsLoading}
          className="sa-touch-btn"
          style={styles.refreshBtn}
        >
          {opsLoading ? 'טוען...' : 'רענן'}
        </button>
      </div>

      <div className="sa-ops-main sa-panel" style={styles.main}>
        <OpsFailuresPanel
          opsFeed={opsFeed}
          opsLoading={opsLoading}
          opsError={opsError}
          onResolveError={resolveError}
          resolvingIds={resolvingIds}
        />
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  toolbarText: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
    maxWidth: 640,
  },
  refreshBtn: {
    background: theme.colors.surface,
    border: `1.5px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    flexShrink: 0,
    minHeight: 44,
  },
  main: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '16px 18px',
    minHeight: 0,
  },
}
