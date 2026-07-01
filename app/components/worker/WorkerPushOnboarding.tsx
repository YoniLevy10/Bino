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
 * Prominent prompt — hidden permanently after worker enables push notifications.
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
      toast.success('התראות שיבוץ הופעלו')
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
      style={{
        margin: '0 12px 10px',
        padding: '14px',
        borderRadius: '14px',
        background: colors.primaryMuted,
        border: `2px solid ${colors.primary}`,
        direction: 'rtl',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '15px', color: colors.textPrimary, marginBottom: '6px' }}>
        קבלו התראה על תקלות חדשות
      </div>
      <p style={{ fontSize: '13px', color: colors.textSecondary, margin: '0 0 12px', lineHeight: 1.5 }}>
        {unsupported
          ? 'הוסיפו את האפליקציה למסך הבית (Android: תפריט → הוסף / iPhone: שיתוף → למסך הבית), ואז הפעילו התראות.'
          : denied
            ? 'ההתראות חסומות. פתחו הגדרות הדפדפן / האפליקציה והפעילו התראות עבור «אזור עובד».'
            : `בכל שיבוץ תקלה תקבלו הודעה + מספר ${openTicketCount > 0 ? 'על האייקון' : 'קטן על האייקון'} — גם כשהאפליקציה סגורה.`}
      </p>
      {!unsupported && !denied ? (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: colors.primary,
            color: colors.textInverse,
            fontWeight: 800,
            fontSize: '15px',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'מפעיל…' : 'הפעל התראות שיבוץ'}
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
