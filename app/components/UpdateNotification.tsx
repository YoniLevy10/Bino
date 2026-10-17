'use client'

import { useEffect, useState } from 'react'
import { theme } from './ui/theme'

export function UpdateNotification() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handler = () => setShow(true)
    window.addEventListener('sw-update-waiting', handler)
    return () => window.removeEventListener('sw-update-waiting', handler)
  }, [])

  function applyUpdate() {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage('SKIP_WAITING')
      }
    })
  }

  if (!show) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--mobile-bottom-nav-height, 80px) + 12px)',
        right: '16px',
        left: '16px',
        zIndex: 9999,
        background: theme.colors.navy,
        color: theme.colors.textInverse,
        borderRadius: theme.radius.xl,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: theme.shadows.lg,
        direction: 'rtl',
        fontSize: '14px',
        border: `1px solid ${theme.colors.navySoft}`,
      }}
    >
      <span style={{ flex: 1 }}>עדכון חדש זמין — רעננו כדי לטעון את העיצוב העדכני</span>
      <button
        onClick={() => setShow(false)}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.navText,
          cursor: 'pointer',
          padding: '4px',
          fontSize: '18px',
          lineHeight: 1,
        }}
        aria-label="סגור"
      >
        ✕
      </button>
      <button
        onClick={applyUpdate}
        style={{
          background: theme.colors.primary,
          color: theme.colors.textInverse,
          border: 'none',
          borderRadius: theme.radius.md,
          padding: '6px 14px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '13px',
          whiteSpace: 'nowrap',
          boxShadow: theme.shadows.primaryBtn,
          minHeight: 40,
        }}
      >
        רענן
      </button>
    </div>
  )
}
