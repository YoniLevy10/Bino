'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useClientBranding } from './ClientBrandingContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPromptBanner() {
  const pathname = usePathname()
  const { displayName, logoUrl } = useClientBranding()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [updatePending, setUpdatePending] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem('pwa-install-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const updateHandler = () => setUpdatePending(true)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('sw-update-waiting', updateHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('sw-update-waiting', updateHandler)
    }
  }, [])

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setPrompt(null)
    } else {
      dismiss()
    }
  }

  function dismiss() {
    sessionStorage.setItem('pwa-install-dismissed', '1')
    setDismissed(true)
  }

  if (pathname?.startsWith('/worker')) return null
  if (!prompt || dismissed) return null

  const iconSrc = logoUrl || '/apple-icon.png'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: updatePending
          ? 'calc(env(safe-area-inset-bottom, 0px) + 72px + 60px)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        right: '16px',
        left: '16px',
        zIndex: 9998,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        direction: 'rtl',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} alt={displayName} style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, objectFit: 'contain' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>התקן את {displayName}</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>גישה מהירה מהמסך הראשי</div>
      </div>
      <button
        onClick={dismiss}
        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', fontSize: '18px', lineHeight: 1, flexShrink: 0 }}
        aria-label="סגור"
      >
        ✕
      </button>
      <button
        onClick={install}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '9px',
          padding: '8px 16px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '13px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        התקן
      </button>
    </div>
  )
}
