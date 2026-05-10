'use client'

import { useEffect, useState } from 'react'

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
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        right: '16px',
        left: '16px',
        zIndex: 9999,
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        direction: 'rtl',
        fontSize: '14px',
      }}
    >
      <span style={{ flex: 1 }}>עדכון חדש זמין 🎉</span>
      <button
        onClick={() => setShow(false)}
        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', fontSize: '18px', lineHeight: 1 }}
        aria-label="סגור"
      >
        ✕
      </button>
      <button
        onClick={applyUpdate}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '6px 14px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '13px',
          whiteSpace: 'nowrap',
        }}
      >
        רענן
      </button>
    </div>
  )
}
