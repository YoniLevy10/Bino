'use client'

import { useEffect, useState } from 'react'

export function OfflineIndicator() {
  const [offline, setOffline] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleOffline = () => {
      setOffline(true)
      setVisible(true)
    }
    const handleOnline = () => {
      setOffline(false)
      // Keep the "חזרת לאוויר" message visible briefly then fade out
      setTimeout(() => setVisible(false), 2500)
    }

    // Cold open in airplane mode — show banner immediately (not only on transition)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      handleOffline()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        right: '16px',
        left: '16px',
        zIndex: 9999,
        background: offline ? '#dc2626' : '#16a34a',
        color: '#fff',
        borderRadius: '10px',
        padding: '10px 16px',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '14px',
        direction: 'rtl',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        transition: 'background 0.3s',
      }}
    >
      {offline ? '📵 אין חיבור לאינטרנט' : '✅ החיבור חזר'}
    </div>
  )
}
