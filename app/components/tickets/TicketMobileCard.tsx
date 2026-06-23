'use client'

import type { CSSProperties } from 'react'
import { StatusBadge, PriorityDot, theme } from '../ui'

export type TicketMobileCardTicket = {
  id: string
  ticket_number: number
  project_code?: string
  project_name?: string
  description?: string | null
  status: string
  priority?: string | null
  created_at?: string
  assigned_worker_id?: string | null
}

type TicketMobileCardProps = {
  ticket: TicketMobileCardTicket
  workerName?: string
  onClick: () => void
  selected?: boolean
}

function formatRelativeAge(createdAt?: string): string {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays > 0) return `לפני ${diffDays} ימים`
  if (diffHours > 0) return `לפני ${diffHours} שע׳`
  return 'עכשיו'
}

export function TicketMobileCard({
  ticket,
  workerName = 'לא משויך',
  onClick,
  selected,
}: TicketMobileCardProps) {
  const building = ticket.project_name || ticket.project_code || '—'
  const desc = ticket.description?.trim() || 'ללא תיאור'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.card,
        ...(selected ? styles.cardSelected : {}),
      }}
      aria-label={`פתח תקלה ${ticket.ticket_number}`}
    >
      <div style={styles.topRow}>
        <span style={styles.number}>#{ticket.ticket_number}</span>
        <div style={styles.badges}>
          <PriorityDot priority={ticket.priority || 'LOW'} />
          <StatusBadge status={ticket.status} size="sm" />
        </div>
      </div>
      <div style={styles.building}>{building}</div>
      <div style={styles.description}>{desc}</div>
      <div style={styles.meta}>
        <span>{workerName}</span>
        {ticket.created_at ? <span>{formatRelativeAge(ticket.created_at)}</span> : null}
      </div>
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '8px',
    width: '100%',
    minHeight: '48px',
    padding: '14px 16px',
    textAlign: 'right',
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  cardSelected: {
    background: theme.colors.primaryMuted,
    borderColor: theme.colors.primary,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  number: {
    fontSize: '15px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  building: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  description: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textAlign: 'right',
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
}
