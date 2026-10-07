'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Button, theme } from '@/app/components/ui'
import { pickRecommendationScreenActions } from '@/lib/recommendations/screen-actions'
import type { ManagementRecommendationRow, RecommendationAction } from '@/lib/recommendations/types'

type Props = {
  row: ManagementRecommendationRow
  onDismissed: (id: string) => void
  /** Close an overlay (mobile bell) after a successful navigation. */
  onNavigated?: () => void
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    /* non-JSON */
  }
  return fallback
}

export function RecommendationAlertActions({ row, onDismissed, onNavigated }: Props) {
  const router = useRouter()
  const { primary, secondary } = pickRecommendationScreenActions(row)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openScreen(action: RecommendationAction) {
    const href = action.href
    if (!href || busy) return
    setBusy(action.id)
    setError(null)
    try {
      await fetchWithTimeout('/api/recommendations/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action_id: action.id }),
      })
    } catch {
      // Viewers may be denied the write; the link itself still opens.
    } finally {
      setBusy(null)
      onNavigated?.()
      router.push(href)
    }
  }

  async function dismiss() {
    if (busy) return
    setBusy('dismiss')
    setError(null)
    try {
      const res = await fetchWithTimeout('/api/recommendations/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      if (!res.ok) {
        setError(await readError(res, 'לא ניתן להסיר את ההתראה'))
        setBusy(null)
        return
      }
      onDismissed(row.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן להסיר את ההתראה')
      setBusy(null)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        {primary?.href ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy != null}
            loading={busy === primary.id}
            style={{ whiteSpace: 'normal', textAlign: 'center' }}
            onClick={() => void openScreen(primary)}
          >
            {primary.label}
          </Button>
        ) : null}
        {secondary?.href ? (
          <button
            type="button"
            style={styles.link}
            disabled={busy != null}
            onClick={() => void openScreen(secondary)}
          >
            {secondary.label}
          </button>
        ) : null}
        <button
          type="button"
          style={styles.dismiss}
          disabled={busy != null}
          onClick={() => void dismiss()}
        >
          {busy === 'dismiss' ? 'מסיר…' : 'הסרה'}
        </button>
      </div>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: 8 },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  link: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: '8px 4px',
    minHeight: 44,
  },
  dismiss: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.textMuted,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: '8px 4px',
    minHeight: 44,
  },
  error: {
    margin: '6px 0 0',
    fontSize: 12,
    lineHeight: 1.4,
    color: theme.colors.error,
  },
}
