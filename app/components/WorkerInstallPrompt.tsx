'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-worker-install-dismissed'

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream
}

type WorkerInstallPromptProps = {
  workerName?: string
}

export function WorkerInstallPrompt({ workerName }: WorkerInstallPromptProps) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalonePwa()) return
    try {
      if (localStorage.getItem(DISMISS_KEY)) {
        setDismissed(true)
        return
      }
    } catch {
      /* ignore */
    }

    if (isIosSafari()) {
      setShowIosHint(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

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

  if (isStandalonePwa() || dismissed) return null
  if (!prompt && !showIosHint) return null

  const title = workerName ? `שלום ${workerName}` : 'אזור עובד'
  const subtitle = showIosHint
    ? 'לחצו על כפתור השיתוף ↗ ואז «הוסף למסך הבית» — בפעם הבאה תיכנסו ישר לתקלות שלכם'
    : 'הוסיפו למסך הבית — בפעם הבאה תיכנסו ישר לתקלות שלכם בלי קישור'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        right: '16px',
        left: '16px',
        zIndex: 9998,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        direction: 'rtl',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-icon.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 4, lineHeight: 1.55 }}>{subtitle}</div>
        {!showIosHint && (
          <button
            type="button"
            onClick={() => void install()}
            style={{
              marginTop: 10,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '9px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            הוסף למסך הבית
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
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
    </div>
  )
}
