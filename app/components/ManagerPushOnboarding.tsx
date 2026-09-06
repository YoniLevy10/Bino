'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { theme } from './ui'
import { toast } from '@/lib/error-handler'
import {
  getManagerPushBlockedReason,
  isManagerPushFullyEnabled,
  isManagerPushSupported,
  subscribeManagerPush,
  syncManagerPushIfGranted,
} from '@/lib/manager-push-client'

function shouldSkipManagerPushUi(pathname: string | null): boolean {
  if (!pathname) return true
  return (
    pathname.startsWith('/worker') ||
    pathname.startsWith('/superadmin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/worker-login') ||
    pathname.startsWith('/vaad-pay') ||
    pathname.startsWith('/pay') ||
    pathname.startsWith('/report') ||
    pathname.startsWith('/intake') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/contact') ||
    pathname.startsWith('/pilot-sms') ||
    pathname.startsWith('/admin')
  )
}

/**
 * Prominent prompt for dashboard PWA users — hidden after push is enabled.
 */
export function ManagerPushOnboarding({ colors = theme.colors }: { colors?: typeof theme.colors }) {
  const pathname = usePathname()
  const skip = shouldSkipManagerPushUi(pathname)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  const refreshState = useCallback(async () => {
    if (skip) {
      setVisible(false)
      setChecking(false)
      return
    }
    setChecking(true)
    try {
      const enabled = await isManagerPushFullyEnabled()
      setVisible(!enabled)
    } finally {
      setChecking(false)
    }
  }, [skip])

  useEffect(() => {
    void refreshState()
  }, [refreshState])

  async function enable() {
    setLoading(true)
    try {
      const result = await subscribeManagerPush()
      if (!result.ok) {
        toast.error(result.error || 'הפעלה נכשלה')
        return
      }
      toast.success('התראות על טיקטים חדשים הופעלו')
      setVisible(false)
    } finally {
      setLoading(false)
    }
  }

  if (skip || checking || !visible) return null

  const blocked = getManagerPushBlockedReason()
  const unsupported = !isManagerPushSupported()
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  return (
    <div
      style={{
        margin: '12px 16px 0',
        padding: '14px',
        borderRadius: '14px',
        background: colors.primaryMuted,
        border: `2px solid ${colors.primary}`,
        direction: 'rtl',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '15px', color: colors.textPrimary, marginBottom: '6px' }}>
        קבלו התראה על תקלה חדשה
      </div>
      <p style={{ fontSize: '13px', color: colors.textSecondary, margin: '0 0 12px', lineHeight: 1.5 }}>
        {blocked
          ? blocked
          : unsupported
            ? 'הוסיפו את האפליקציה למסך הבית, ואז הפעילו התראות.'
            : denied
              ? 'ההתראות חסומות. פתחו הגדרות המכשיר והפעילו התראות עבור במקור.'
              : 'כשנפתחת תקלה חדשה תקבלו התראה בטלפון — גם כשהאפליקציה סגורה.'}
      </p>
      {!unsupported && !denied && !blocked ? (
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
          {loading ? 'מפעיל…' : 'הפעל התראות'}
        </button>
      ) : null}
    </div>
  )
}

/** Background sync of push subscription when permission already granted. */
export function ManagerPushSync() {
  const pathname = usePathname()
  const skip = shouldSkipManagerPushUi(pathname)

  useEffect(() => {
    if (skip) return
    void syncManagerPushIfGranted()
  }, [skip, pathname])

  return null
}
