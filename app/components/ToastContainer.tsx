'use client'

/**
 * Toast notification container
 * Displays success, error, warning, and info messages
 */

import React from 'react'
import { Toast, registerToastHandler } from '@/lib/error-handler'
import { theme } from './ui'

const TOAST_Z_INDEX = 350

type ToastStyle = { bg: string; border: string; text: string; icon: string }

const toastStyles: Record<Toast['type'], ToastStyle> = {
  success: {
    bg: theme.colors.successMuted,
    border: theme.colors.success,
    text: theme.colors.textPrimary,
    icon: theme.colors.success,
  },
  error: {
    bg: theme.colors.errorMuted,
    border: theme.colors.error,
    text: theme.colors.textPrimary,
    icon: theme.colors.error,
  },
  warning: {
    bg: theme.colors.warningMuted,
    border: theme.colors.warning,
    text: theme.colors.textPrimary,
    icon: theme.colors.warning,
  },
  info: {
    bg: theme.colors.infoMuted,
    border: theme.colors.info,
    text: theme.colors.textPrimary,
    icon: theme.colors.info,
  },
}

function StatusIcon({ type, color }: { type: Toast['type']; color: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  switch (type) {
    case 'success':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )
    case 'error':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...common}>
          <path d="M12 3 2 20h20L12 3z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      )
    case 'info':
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      )
  }
}

export const ToastContainer = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  React.useEffect(() => {
    registerToastHandler({
      show: (toast: Toast) => {
        setToasts((prev) => {
          if (
            toast.type === 'error' &&
            prev.some((item) => item.type === 'error' && item.message === toast.message)
          ) {
            return prev
          }
          return [...prev, toast]
        })

        if (toast.duration && toast.duration > 0) {
          setTimeout(() => {
            removeToast(toast.id)
          }, toast.duration)
        }
      },
    })
  }, [removeToast])

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        insetInlineEnd: 16,
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
        zIndex: TOAST_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 384,
        width: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const style = toastStyles[toast.type] || toastStyles.info
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 12px 12px 8px',
              borderRadius: theme.radius.md,
              border: `1px solid ${style.border}`,
              background: style.bg,
              color: style.text,
              boxShadow: theme.shadows.md,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: theme.radius.full,
                background: '#fff',
                border: `1px solid ${style.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              <StatusIcon type={toast.type} color={style.icon} />
            </span>
            <p style={{ flex: 1, margin: 0, fontSize: 14, lineHeight: 1.45, fontWeight: 600 }}>
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="סגירה"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: theme.radius.sm,
                background: 'transparent',
                border: 'none',
                color: theme.colors.textMuted,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
