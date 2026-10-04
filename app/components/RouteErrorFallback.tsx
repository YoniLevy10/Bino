'use client'

import type { CSSProperties } from 'react'
import { theme } from '@/app/components/ui/theme'

type Props = {
  title?: string
  message?: string
  onRetry?: () => void
  showDashboardLink?: boolean
  /** global-error cannot use next/link reliably — use <a> */
  linkAsAnchor?: boolean
}

/**
 * Shared Hebrew error UI for App Router error boundaries.
 * No stack traces, no technical dumps.
 */
export function RouteErrorFallback({
  title = 'משהו השתבש',
  message = 'לא הצלחנו לטעון את המסך. אפשר לנסות שוב או לחזור ללוח הבקרה.',
  onRetry,
  showDashboardLink = true,
  linkAsAnchor = false,
}: Props) {
  return (
    <main dir="rtl" style={shellStyle} role="alert">
      <div style={cardStyle}>
        <p style={brandStyle}>BINO</p>
        <h1 style={titleStyle}>{title}</h1>
        <p style={msgStyle}>{message}</p>
        <div style={actionsStyle}>
          {onRetry ? (
            <button type="button" onClick={onRetry} style={primaryBtnStyle}>
              נסה שוב
            </button>
          ) : null}
          {showDashboardLink ? (
            linkAsAnchor ? (
              <a href="/dashboard" style={secondaryBtnStyle}>
                חזרה ללוח הבקרה
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- works inside error.tsx without Link context
              <a href="/dashboard" style={secondaryBtnStyle}>
                חזרה ללוח הבקרה
              </a>
            )
          ) : null}
        </div>
      </div>
    </main>
  )
}

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: theme.colors.background,
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: theme.colors.surface,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  padding: '28px 24px',
  textAlign: 'right',
  boxShadow: '0 8px 30px rgba(26, 26, 46, 0.06)',
}

const brandStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: theme.colors.primary,
}

const titleStyle: CSSProperties = {
  margin: '10px 0 8px',
  fontSize: 22,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const msgStyle: CSSProperties = {
  margin: '0 0 20px',
  fontSize: 15,
  lineHeight: 1.5,
  color: theme.colors.textSecondary,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
}

const primaryBtnStyle: CSSProperties = {
  border: 'none',
  borderRadius: theme.radius.md,
  background: theme.colors.primary,
  color: theme.colors.textInverse,
  padding: '10px 16px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtnStyle: CSSProperties = {
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.borderStrong}`,
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
  padding: '10px 16px',
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
}
