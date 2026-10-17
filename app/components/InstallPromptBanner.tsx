'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useClientBranding } from './ClientBrandingContext'
import { theme } from './ui/theme'

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

  // Keep marketing / legal surfaces clean for guests and crawlers
  if (
    !pathname ||
    pathname === '/' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/contact' ||
    pathname === '/vaad-pay' ||
    pathname.startsWith('/vaad-pay/') ||
    pathname.startsWith('/worker')
  ) {
    return null
  }
  if (!prompt || dismissed) return null

  const iconSrc = logoUrl || '/apple-icon.png'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: updatePending
          ? 'calc(env(safe-area-inset-bottom, 0px) + 64px + 60px)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
        right: '16px',
        left: '16px',
        zIndex: 9998,
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.xl,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: theme.shadows.md,
        direction: 'rtl',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt={displayName}
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.md,
          flexShrink: 0,
          objectFit: 'contain',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: theme.colors.textPrimary }}>
          התקן את {displayName}
        </div>
        <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginTop: 2 }}>
          גישה מהירה מהמסך הראשי
        </div>
      </div>
      <button
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.textMuted,
          cursor: 'pointer',
          padding: '4px',
          fontSize: '18px',
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="סגור"
      >
        ✕
      </button>
      <button
        onClick={install}
        style={{
          background: theme.colors.primary,
          color: theme.colors.textInverse,
          border: 'none',
          borderRadius: theme.radius.md,
          padding: '8px 16px',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '13px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: theme.shadows.primaryBtn,
          minHeight: 40,
        }}
      >
        התקן
      </button>
    </div>
  )
}
