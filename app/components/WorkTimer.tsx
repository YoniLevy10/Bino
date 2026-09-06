'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'bamakor_work_seconds'

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatHours(totalSec: number): string {
  const h = (totalSec / 3600).toFixed(1)
  return `${h}h`
}

export function WorkTimer() {
  const [mounted, setMounted] = useState(false)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
    setTotalSeconds(saved)

    const intervalId = setInterval(() => {
      if (document.hidden) return
      setTotalSeconds(prev => {
        const next = prev + 1
        localStorage.setItem(STORAGE_KEY, String(next))
        return next
      })
      setSessionSeconds(prev => prev + 1)
    }, 1000)

    const handleVisibility = () => setIsActive(!document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  if (!mounted) return null
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!isLocalhost) return null

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('לאפס את השעון? הזמן הצבור יימחק לצמיתות.')) {
      setTotalSeconds(0)
      setSessionSeconds(0)
      localStorage.setItem(STORAGE_KEY, '0')
    }
  }

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 9998,
        background: 'rgba(12, 12, 18, 0.88)',
        color: '#fff',
        borderRadius: expanded ? '18px' : '14px',
        cursor: 'pointer',
        userSelect: 'none',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        transition: 'border-radius 0.2s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {expanded ? (
        <div style={{ padding: '16px 20px', minWidth: '210px' }}>
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '1px',
              opacity: 0.4,
              marginBottom: '12px',
              textTransform: 'uppercase',
            }}
          >
            Bino · Dev Timer
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '12px', opacity: 0.65 }}>סה״כ פרויקט</span>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '18px',
                  fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
                  letterSpacing: '-0.5px',
                }}
              >
                {formatTime(totalSeconds)}
              </span>
              <span style={{ fontSize: '11px', opacity: 0.4, marginRight: '6px' }}>
                ({formatHours(totalSeconds)})
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontSize: '12px', opacity: 0.65 }}>סשן נוכחי</span>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
                fontSize: '13px',
                opacity: 0.75,
              }}
            >
              {formatTime(sessionSeconds)}
            </span>
          </div>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.09)',
              paddingTop: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                opacity: 0.4,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isActive ? '#34c759' : '#666',
                  display: 'inline-block',
                }}
              />
              {isActive ? 'פעיל' : 'מושהה'}
            </span>
            <button
              onClick={handleReset}
              style={{
                background: 'none',
                border: '1px solid rgba(255,80,80,0.3)',
                color: 'rgba(255,120,120,0.8)',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '3px 10px',
                borderRadius: '6px',
              }}
            >
              איפוס
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '9px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              opacity: isActive ? 1 : 0.35,
              transition: 'opacity 0.3s',
            }}
          >
            ⏱
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: '15px',
              fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
              letterSpacing: '-0.3px',
            }}
          >
            {formatTime(totalSeconds)}
          </span>
        </div>
      )}
    </div>
  )
}
