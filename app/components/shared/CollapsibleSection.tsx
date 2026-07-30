'use client'

import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../ui'

type CollapsibleSectionProps = {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  badge?: string
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
  badge,
}: CollapsibleSectionProps) {
  return (
    <div style={styles.wrap}>
      <button type="button" onClick={onToggle} style={styles.toggle} aria-expanded={open}>
        <span style={styles.title}>
          {title}
          {badge ? <span style={styles.badge}>{badge}</span> : null}
        </span>
        <span style={styles.chevron} aria-hidden>
          {open ? '▾' : '◂'}
        </span>
      </button>
      {open ? <div style={styles.body}>{children}</div> : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    background: theme.colors.surface,
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    width: '100%',
    padding: '12px 14px',
    border: 'none',
    background: theme.colors.muted,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'right',
  },
  title: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: theme.radius.sm,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontSize: '11px',
    fontWeight: 700,
  },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: '14px',
    lineHeight: 1,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '14px',
    borderTop: `1px solid ${theme.colors.border}`,
  },
}
