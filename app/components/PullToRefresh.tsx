'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { dispatchAppRefresh } from '@/lib/app-refresh'
import { theme } from './ui'

const PULL_THRESHOLD_PX = 72
const MAX_PULL_PX = 110

type PullToRefreshProps = {
  children: ReactNode
  enabled?: boolean
}

export function PullToRefresh({ children, enabled = true }: PullToRefreshProps) {
  const router = useRouter()
  const [pullPx, setPullPx] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  const pullingRef = useRef(false)
  const pullPxRef = useRef(0)

  const runRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setPullPx(PULL_THRESHOLD_PX)
    try {
      dispatchAppRefresh()
      router.refresh()
    } finally {
      window.setTimeout(() => {
        setRefreshing(false)
        setPullPx(0)
      }, 450)
    }
  }, [refreshing, router])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const canPull = () => window.scrollY <= 2

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || !canPull()) return
      startYRef.current = e.touches[0]?.clientY ?? null
      pullingRef.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || startYRef.current == null || refreshing) return
      if (!canPull()) {
        setPullPx(0)
        return
      }
      const y = e.touches[0]?.clientY ?? startYRef.current
      const delta = y - startYRef.current
      if (delta <= 0) {
        pullPxRef.current = 0
        setPullPx(0)
        return
      }
      const damped = Math.min(MAX_PULL_PX, delta * 0.45)
      pullPxRef.current = damped
      setPullPx(damped)
      if (damped > 8) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (!pullingRef.current) return
      pullingRef.current = false
      startYRef.current = null
      const pulled = pullPxRef.current
      if (pulled >= PULL_THRESHOLD_PX) {
        void runRefresh()
      } else {
        pullPxRef.current = 0
        setPullPx(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [enabled, refreshing, runRefresh])

  const showIndicator = enabled && (pullPx > 4 || refreshing)
  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX)

  return (
    <>
      {showIndicator ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            left: '50%',
            transform: `translateX(-50%) translateY(${refreshing ? 0 : pullPx - 28}px)`,
            zIndex: 200,
            width: 36,
            height: 36,
            borderRadius: theme.radius.full,
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            boxShadow: theme.shadows.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: refreshing ? 1 : 0.35 + progress * 0.65,
            transition: refreshing ? 'opacity 0.2s' : 'none',
            pointerEvents: 'none',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 220}deg)`,
              animation: refreshing ? 'spin 0.8s linear infinite' : undefined,
            }}
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        </div>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {children}
    </>
  )
}
