'use client'

import type { CSSProperties } from 'react'
import { StatusBadge, theme } from '../ui'

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
  reporterLabel?: string | null
}

function formatRelativeAge(createdAt?: string): string {
  if (!createdAt) return ''
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'לפני יום'
  if (diffDays > 1) return `לפני ${diffDays} ימים`
  if (diffHours === 1) return 'לפני שעה'
  if (diffHours > 1) return `לפני ${diffHours} שע׳`
  return 'עכשיו'
}

function priorityStripe(priority: string): string | undefined {
  if (priority === 'URGENT') return theme.colors.error
  if (priority === 'HIGH') return theme.colors.warning
  return undefined
}

export function TicketMobileCard({
  ticket,
  workerName = 'לא משויך',
  onClick,
  selected,
  reporterLabel,
}: TicketMobileCardProps) {
  const building = ticket.project_name || 'בניין'
  const desc = ticket.description?.trim() || 'ללא תיאור'
  const priority = (ticket.priority || 'LOW').toUpperCase()
  const unassigned = !ticket.assigned_worker_id
  const stripe = priorityStripe(priority)
  const age = ticket.created_at ? formatRelativeAge(ticket.created_at) : ''

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.card,
        borderInlineStartColor: stripe || (selected ? theme.colors.primary : theme.colors.border),
        ...(selected ? styles.cardSelected : {}),
        ...(unassigned && !selected ? styles.cardUnassigned : {}),
      }}
      aria-label={`פתח תקלה ${ticket.ticket_number}, ${building}${unassigned ? ', ממתינה לשיוך' : ''}`}
    >
      <span style={styles.top}>
        <span style={styles.building}>{building}</span>
        <StatusBadge status={ticket.status} size="sm" />
      </span>
      <span style={styles.identity}>
        <span style={styles.number}>#{ticket.ticket_number}</span>
        {age ? <span style={styles.age}>{age}</span> : null}
      </span>
      <span style={styles.description}>{desc}</span>
      {reporterLabel ? <span style={styles.reporter}>{reporterLabel}</span> : null}
      <span style={styles.footer}>
        <span style={unassigned ? styles.awaiting : styles.worker}>
          {unassigned ? 'ממתינה לשיוך' : workerName}
        </span>
      </span>
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
    width: '100%',
    minHeight: '48px',
    padding: '14px 14px 12px',
    textAlign: 'right',
    font: 'inherit',
    color: theme.colors.textPrimary,
    background: theme.colors.surface,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.colors.border,
    borderInlineStartWidth: '4px',
    borderRadius: theme.radius.lg,
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  cardSelected: {
    background: theme.colors.blueSoft,
    borderColor: theme.colors.primary,
  },
  cardUnassigned: {
    background: '#fffdf8',
  },
  top: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
  },
  building: {
    minWidth: 0,
    fontSize: '17px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
    color: theme.colors.textPrimary,
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
    color: theme.colors.primary,
  },
  age: {
    fontWeight: 600,
  },
  description: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textAlign: 'right',
  },
  reporter: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginTop: '2px',
    paddingTop: '8px',
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
  },
  awaiting: {
    fontSize: '13px',
    fontWeight: 800,
    color: theme.colors.warning,
  },
  worker: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.textSecondary,
  },
}
