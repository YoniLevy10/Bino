'use client'

import { useEffect, useRef, useState } from 'react'
import { useClientBranding } from './ClientBrandingContext'
import { markAppSplashComplete, shouldShowAppSplash } from '@/lib/app-splash-session'

/** Keep short so Speed Insights LCP is not blocked on repeat visits. */
const MIN_VISIBLE_MS = 350
const EXIT_MS = 320
const DEFAULT_SPLASH_LOGO = '/apple-icon.png'

const splashLogoStyle = {
  width: 80,
  height: 80,
  objectFit: 'contain' as const,
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(26, 26, 46, 0.08)',
}

type AppSplashScreenProps = {
  ready: boolean
}

export function AppSplashScreen({ ready }: AppSplashScreenProps) {
  const branding = useClientBranding()
  const [visible, setVisible] = useState(() => shouldShowAppSplash())
  const [exiting, setExiting] = useState(false)
  const [barWidth, setBarWidth] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    startRef.current = Date.now()
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setBarWidth(100)
      return
    }

    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const elapsed = now - started
      const target = ready ? 100 : Math.min(88, 12 + elapsed / 18)
      setBarWidth(target)
      if (!ready || target < 100) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ready])

  useEffect(() => {
    if (!ready || !visible || exiting) return
    setBarWidth(100)
    const elapsed = Date.now() - startRef.current
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed)
    const startExit = window.setTimeout(() => {
      setExiting(true)
    }, delay)
    return () => window.clearTimeout(startExit)
  }, [ready, visible, exiting])

  useEffect(() => {
    if (!exiting) return
    const done = window.setTimeout(() => {
      markAppSplashComplete()
      setVisible(false)
    }, EXIT_MS)
    return () => window.clearTimeout(done)
  }, [exiting])

  if (!visible) return null

  const title = branding.displayName

  return (
    <div
      className="bamakor-splash-root"
      data-exiting={exiting ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      aria-busy={!ready}
      aria-label="טוען נתונים"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background, #F9F9FB)',
        userSelect: 'none',
        pointerEvents: exiting ? 'none' : 'auto',
      }}
    >
      <div className="bamakor-splash-glow" aria-hidden />

      <div className="bamakor-splash-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: -10,
              borderRadius: 20,
              border: '1px solid rgba(26, 26, 46, 0.08)',
              transform: 'scale(1.12)',
            }}
          />
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              width={80}
              height={80}
              style={splashLogoStyle}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={DEFAULT_SPLASH_LOGO}
              alt=""
              width={80}
              height={80}
              style={splashLogoStyle}
            />
          )}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--color-text-primary, #1A1A2E)',
          }}
        >
          {title}
        </h1>
      </div>

      <p
        className="bamakor-splash-tagline"
        style={{
          marginTop: 12,
          fontSize: 11,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--color-primary, #0066FF)',
          fontWeight: 500,
        }}
      >
        {ready ? 'מוכן' : 'טוען נתונים'}
      </p>

      <div
        style={{
          marginTop: 56,
          width: 192,
          height: 2,
          borderRadius: 999,
          background: 'var(--color-border, #E8E8ED)',
          overflow: 'hidden',
        }}
        aria-hidden
      >
        <div
          style={{
            height: '100%',
            width: `${barWidth}%`,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #0066FF 0%, #3399FF 100%)',
            transition: ready ? 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' : 'width 0.12s linear',
          }}
        />
      </div>
    </div>
  )
}
