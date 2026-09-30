'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { theme } from '@/app/components/ui'

/** Shared Apple iOS 27 Liquid Glass tokens for the resident portal. */
export const residentTheme = theme

export const RESIDENT_TABBAR_CLEARANCE =
  'calc(88px + env(safe-area-inset-bottom, 0px))'

export function ResidentAmbientWash() {
  return <div className="worker-ambient-wash" aria-hidden />
}

export function ResidentCard({
  children,
  style,
  className,
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      className={['lg-glass', className].filter(Boolean).join(' ')}
      style={{ ...residentCardStyle, ...style }}
    >
      {children}
    </div>
  )
}

export function ResidentPrimaryButton({
  children,
  type = 'button',
  disabled,
  onClick,
  style,
  href,
}: {
  children: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  style?: CSSProperties
  href?: string
}) {
  const merged: CSSProperties = {
    ...residentPrimaryBtnStyle,
    opacity: disabled ? 0.65 : 1,
    ...style,
  }
  if (href) {
    const external = href.startsWith('http')
    if (external) {
      return (
        <a
          href={href}
          className="lg-btn lg-btn-primary"
          style={merged}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className="lg-btn lg-btn-primary" style={merged}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="lg-btn lg-btn-primary"
      style={merged}
    >
      {children}
    </button>
  )
}

export function ResidentField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['lg-field', props.className].filter(Boolean).join(' ')} style={{ ...residentFieldStyle, ...props.style }} />
}

export function ResidentTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={['lg-field', props.className].filter(Boolean).join(' ')}
      style={{ ...residentFieldStyle, resize: 'vertical', ...props.style }}
    />
  )
}

export function ResidentSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={['lg-field', props.className].filter(Boolean).join(' ')}
      style={{ ...residentFieldStyle, ...props.style }}
    />
  )
}

export function ResidentPageTitle({ children }: { children: ReactNode }) {
  return <h1 style={residentPageTitleStyle}>{children}</h1>
}

export function ResidentSectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={residentSectionTitleStyle}>{children}</h2>
}

export function ResidentMuted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ ...residentMutedStyle, ...style }}>{children}</p>
}

export function ResidentAlert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'success' | 'info' | 'warning'
}) {
  const tones = {
    error: { bg: theme.colors.errorMuted, color: theme.colors.error },
    success: { bg: theme.colors.successMuted, color: theme.colors.success },
    info: { bg: theme.colors.infoMuted, color: theme.colors.primary },
    warning: { bg: theme.colors.warningMuted, color: theme.colors.warning },
  } as const
  const t = tones[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="lg-glass"
      style={{
        background: t.bg,
        color: t.color,
        padding: '12px 14px',
        borderRadius: theme.radius.lg,
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {children}
    </div>
  )
}

export function ResidentNavIcon({
  name,
  active,
}: {
  name: 'home' | 'payments' | 'tickets' | 'info'
  active?: boolean
}) {
  const color = active ? theme.colors.primary : theme.colors.textMuted
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      )
    case 'payments':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      )
    case 'tickets':
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      )
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      )
  }
}

const residentCardStyle: CSSProperties = {
  borderRadius: theme.radius.xl,
  padding: theme.spacing.lg,
  color: theme.colors.textPrimary,
}

const residentPrimaryBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 48,
  padding: '0 16px',
  borderRadius: theme.radius.md,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
  textDecoration: 'none',
  cursor: 'pointer',
  border: 'none',
  color: theme.colors.textInverse,
}

const residentFieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  fontSize: 16,
  padding: '12px 14px',
  color: theme.colors.textPrimary,
  fontFamily: 'inherit',
}

const residentPageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.xl,
  fontWeight: theme.typography.fontWeight.bold,
  color: theme.colors.textPrimary,
  letterSpacing: '-0.01em',
}

const residentSectionTitleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.textPrimary,
}

const residentMutedStyle: CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.textMuted,
  lineHeight: 1.45,
}

export const residentShellStyles = {
  root: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
    color: theme.colors.textPrimary,
    fontFamily: 'var(--font-heebo), -apple-system, BlinkMacSystemFont, sans-serif',
  } satisfies CSSProperties,
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    padding: '12px 16px',
    paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } satisfies CSSProperties,
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    background: 'linear-gradient(180deg, #3b9bff 0%, #007aff 46%, #0071eb 100%)',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    fontSize: 15,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.48), inset 0 0 0 0.5px rgba(0,40,100,0.18)',
    flexShrink: 0,
  } satisfies CSSProperties,
  title: {
    fontWeight: theme.typography.fontWeight.semibold,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: 1.25,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    lineHeight: 1.3,
  } satisfies CSSProperties,
  headerAction: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    minHeight: 44,
    padding: '0 8px',
    cursor: 'pointer',
  } satisfies CSSProperties,
  main: {
    flex: 1,
    padding: '16px 16px 0',
    paddingBottom: RESIDENT_TABBAR_CLEARANCE,
    maxWidth: 560,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
  } satisfies CSSProperties,
  tabbar: {
    position: 'fixed',
    insetInline: 12,
    bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
    zIndex: 30,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 2,
    padding: 6,
  } satisfies CSSProperties,
  tabItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 52,
    padding: '6px 4px',
    border: 'none',
    background: 'transparent',
    textDecoration: 'none',
    borderRadius: theme.radius.md,
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } satisfies CSSProperties,
  tabItemActive: {
    color: theme.colors.primary,
  } satisfies CSSProperties,
  fab: {
    position: 'fixed',
    bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
    left: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    display: 'grid',
    placeItems: 'center',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 13,
    color: '#fff',
    zIndex: 40,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.48), 0 10px 28px rgba(0,122,255,0.35)',
  } satisfies CSSProperties,
  balanceValue: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: '-0.02em',
    color: theme.colors.textPrimary,
    lineHeight: 1.1,
  } satisfies CSSProperties,
  label: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    display: 'block',
    marginBottom: 6,
  } satisfies CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 700,
  } satisfies CSSProperties,
} as const
