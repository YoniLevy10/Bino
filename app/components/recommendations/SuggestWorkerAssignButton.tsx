'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '@/app/components/ui'
import type { SuggestWorkerResult } from '@/lib/recommendations/suggest-worker'

type Props = {
  ticketId: string
  /** Current assigned worker draft — hide when already set. */
  assignedWorkerId?: string | null
  ticketCreatedAt?: string | null
  onAssigned?: (workerId: string) => void
}

export function SuggestWorkerAssignButton({
  ticketId,
  assignedWorkerId,
  ticketCreatedAt,
  onAssigned,
}: Props) {
  const [suggestion, setSuggestion] = useState<SuggestWorkerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!ticketId || assignedWorkerId) {
      setSuggestion(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchWithTimeout(
      `/api/recommendations/suggest-worker?ticket_id=${encodeURIComponent(ticketId)}`
    )
      .then(async (res) => {
        if (!res.ok) return
        const body = (await res.json()) as { suggestion?: SuggestWorkerResult | null }
        if (!cancelled) setSuggestion(body.suggestion ?? null)
      })
      .catch(() => {
        if (!cancelled) setSuggestion(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, assignedWorkerId])

  if (assignedWorkerId || loading || !suggestion) return null

  async function assignConfirmed() {
    if (!suggestion || busy) return
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/assign-ticket',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_id: ticketId,
            worker_id: suggestion.workerId,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'שיוך נכשל')
        return
      }
      const openedMs = ticketCreatedAt ? Date.parse(ticketCreatedAt) : NaN
      const seconds = Number.isFinite(openedMs)
        ? Math.max(0, Math.round((Date.now() - openedMs) / 1000))
        : null
      if (seconds != null) {
        toast.success(`שויך תוך ${seconds} שניות · ${suggestion.workerName}`)
      } else {
        toast.success(`שויך ל${suggestion.workerName}`)
      }
      setConfirming(false)
      setSuggestion(null)
      onAssigned?.(suggestion.workerId)
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <div style={styles.box}>
        <p style={styles.reason}>{suggestion.reasonHe}</p>
        <p style={styles.confirmText}>
          לשייך את התקלה ל<strong>{suggestion.workerName}</strong>?
        </p>
        <div style={styles.actions}>
          <Button
            type="button"
            size="sm"
            variant="primary"
            loading={busy}
            onClick={() => void assignConfirmed()}
          >
            אישור שיוך
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            ביטול
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.box}>
      <p style={styles.reason}>{suggestion.reasonHe}</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        שייך לעובד המומלץ · {suggestion.workerName}
      </Button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  box: {
    marginTop: 8,
    padding: '10px 12px',
    borderRadius: 12,
    background: theme.colors.primaryMuted,
    border: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  reason: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.4,
    color: theme.colors.textSecondary,
  },
  confirmText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
}
