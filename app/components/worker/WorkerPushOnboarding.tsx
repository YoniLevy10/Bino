'use client'

import { useCallback, useEffect, useState } from 'react'
import { theme } from '../ui'
import { toast } from '@/lib/error-handler'
import {
  isWorkerPushFullyEnabled,
  isWorkerPushSupported,
  subscribeWorkerPush,
} from '@/lib/worker-push-client'

type WorkerPushOnboardingProps = {
  token: string
  colors?: typeof theme.colors
  openTicketCount?: number
  onEnabled?: () => void
}

/**
 * Compact prompt — hidden once the worker enables push notifications.
 */
export function WorkerPushOnboarding({
  token,
  colors = theme.colors,
  openTicketCount = 0,
  onEnabled,
}: WorkerPushOnboardingProps) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  const refreshState = useCallback(async () => {
    setChecking(true)
    try {
      const enabled = await isWorkerPushFullyEnabled()
      if (enabled) {
        setVisible(false)
        onEnabled?.()
        return
      }
      setVisible(true)
    } finally {
      setChecking(false)
    }
  }, [onEnabled])

  useEffect(() => {
    void refreshState()
  }, [refreshState, token])

  async function enable() {
    setLoading(true)
    try {
      const result = await subscribeWorkerPush(token)
      if (!result.ok) {
        toast.error(result.error || 'הפעלה נכשלה')
        return
      }
      toast.success('התראות על תקלות חדשות הופעלו')
      setVisible(false)
      onEnabled?.()
    } finally {
      setLoading(false)
    }
  }

  if (checking || !visible) return null

  const unsupported = !isWorkerPushSupported()
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  return (
    <div
      className="lg-glass worker-push-onboarding"
      style={{
        margin: 0,
        padding: '12px',
        borderRadius: 18,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        direction: 'rtl',
        display: 'grid',
        gridTemplateColumns: unsupported || denied ? '38px minmax(0, 1fr)' : '38px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          display: 'grid',
          placeItems: 'center',
          background: colors.primaryMuted,
          color: colors.primary,
        }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: colors.textPrimary, marginBottom: '3px' }}>
          קבלו התראה על תקלות חדשות
        </div>
        <p style={{ fontSize: '13px', color: colors.textSecondary, margin: 0, lineHeight: 1.4 }}>
          {unsupported
            ? 'הוסיפו את האפליקציה למסך הבית (Android: תפריט → הוסף / iPhone: שיתוף → למסך הבית), ואז הפעילו התראות.'
            : denied
              ? 'ההתראות חסומות. פתחו הגדרות הדפדפן / האפליקציה והפעילו התראות עבור «אזור עובד».'
              : `בכל תקלה חדשה ובכל שיבוץ תקבלו הודעה${openTicketCount > 0 ? ' + מספר על האייקון' : ''} — גם כשהאפליקציה סגורה.`}
        </p>
      </div>
      {!unsupported && !denied ? (
        <button
          type="button"
          className="lg-btn-primary"
          onClick={() => void enable()}
          disabled={loading}
          style={{
            width: 'auto',
            flexShrink: 0,
            padding: '10px 12px',
            borderRadius: 14,
            border: 'none',
            fontWeight: 800,
            fontSize: '14px',
            cursor: loading ? 'wait' : 'pointer',
            minHeight: 44,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'מפעיל…' : 'הפעל התראות'}
        </button>
      ) : null}
    </div>
  )
}

/** Background sync of push subscription when permission already granted. */
export function WorkerPushSync({ token, onEnabled }: { token: string; onEnabled?: () => void }) {
  useEffect(() => {
    if (!token) return
    void (async () => {
      const { syncWorkerPushIfGranted } = await import('@/lib/worker-push-client')
      const ok = await syncWorkerPushIfGranted(token)
      if (ok) onEnabled?.()
    })()
  }, [token, onEnabled])
  return null
}
