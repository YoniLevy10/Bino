'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { OpsFailuresPanel, type OpsFeed } from './OpsFailuresPanel'
import { theme } from '../ui'

type Props = {
  adminSecret: string
}

export function SuperadminOpsPanel({ adminSecret }: Props) {
  const [opsFeed, setOpsFeed] = useState<OpsFeed | null>(null)
  const [opsLoading, setOpsLoading] = useState(true)
  const [opsError, setOpsError] = useState('')

  const loadOpsFeed = useCallback(async () => {
    setOpsLoading(true)
    setOpsError('')
    try {
      const res = await fetchWithTimeout('/api/superadmin/ops-feed?limit=50', {
        headers: { 'x-admin-secret': adminSecret },
      })
      const json = await res.json() as OpsFeed & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setOpsFeed({
        failed_notifications: json.failed_notifications ?? [],
        error_logs: json.error_logs ?? [],
        counts: json.counts ?? {
          failed_notifications: 0,
          error_logs: 0,
          unresolved_errors: 0,
        },
      })
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setOpsLoading(false)
    }
  }, [adminSecret])

  useEffect(() => {
    void loadOpsFeed()
  }, [loadOpsFeed])

  return (
    <div>
      <div style={styles.toolbar}>
        <p style={styles.toolbarText}>
          כשלונות SMS/WhatsApp ושגיאות אחרונות מ-`failed_notifications` ו-`error_logs`.
        </p>
        <button
          type="button"
          onClick={() => void loadOpsFeed()}
          disabled={opsLoading}
          style={styles.refreshBtn}
        >
          {opsLoading ? 'טוען...' : 'רענן'}
        </button>
      </div>

      <div style={styles.main}>
        <OpsFailuresPanel opsFeed={opsFeed} opsLoading={opsLoading} opsError={opsError} />
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
  },
  main: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '24px 28px',
    minHeight: 400,
  },
}
