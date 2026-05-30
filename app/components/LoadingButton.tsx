'use client'

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { theme } from './ui'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export type LoadingButtonProps = {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  loading?: boolean
  loadingText?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  style?: CSSProperties
  className?: string
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: { background: theme.colors.primary, color: theme.colors.textInverse, border: 'none' },
  secondary: { background: theme.colors.surface, color: theme.colors.textPrimary, border: `1px solid ${theme.colors.border}` },
  ghost: { background: 'transparent', color: theme.colors.textSecondary, border: 'none' },
  danger: { background: theme.colors.errorMuted, color: theme.colors.error, border: `1px solid ${theme.colors.error}` },
}

const sizeStyles: Record<'sm' | 'md' | 'lg', CSSProperties> = {
  sm: { padding: '8px 14px', fontSize: '13px', minHeight: '34px' },
  md: { padding: '10px 18px', fontSize: '15px', minHeight: '40px' },
  lg: { padding: '12px 24px', fontSize: '16px', minHeight: '48px' },
}

export function LoadingButton({
  children,
  onClick,
  loading = false,
  loadingText,
  disabled,
  type = 'button',
  variant = 'primary',
  size = 'md',
  style,
  className,
}: LoadingButtonProps) {
  const [busy, setBusy] = useState(false)
  const isBusy = loading || busy

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (isBusy || disabled || !onClick) return
    const result = onClick(e)
    if (result instanceof Promise) {
      setBusy(true)
      try {
        await result
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <button
      type={type}
      className={className}
      disabled={disabled || isBusy}
      onClick={handleClick}
      style={{
        borderRadius: theme.radius.md,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: disabled || isBusy ? 'not-allowed' : 'pointer',
        opacity: disabled || isBusy ? 0.65 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
    >
      {isBusy ? (loadingText ?? children) : children}
    </button>
  )
}
