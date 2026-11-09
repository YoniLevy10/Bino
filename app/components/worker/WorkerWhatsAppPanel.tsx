'use client'

import { useState, type CSSProperties } from 'react'
import { TicketWhatsAppThread } from '@/app/components/tickets/TicketWhatsAppThread'
import { formatPhoneLocalIl } from '@/lib/sales-leads/phone'
import { type theme } from '../ui'

export type WorkerWhatsAppTicket = {
  id: string
  ticket_number: number
  description: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  project_name?: string | null
  building_number?: string | null
}

type Props = {
  token: string
  colors: typeof theme.colors
  tickets: WorkerWhatsAppTicket[]
}

function locationLine(ticket: WorkerWhatsAppTicket): string {
  const parts: string[] = []
  if (ticket.project_name) parts.push(ticket.project_name)
  if (ticket.building_number) parts.push(`בניין ${ticket.building_number}`)
  return parts.join(' · ')
}

function shortProblem(desc: string): string {
  const line = desc.replace(/\s+/g, ' ').trim()
  if (line.length <= 72) return line
  return `${line.slice(0, 70).trim()}…`
}

export function WorkerWhatsAppPanel({ token, colors, tickets }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const reachable = tickets.filter((ticket) => ticket.reporter_phone?.trim())
  const selected = reachable.find((ticket) => ticket.id === selectedId) ?? null

  if (selected?.reporter_phone) {
    return (
      <TicketWhatsAppThread
        reporterPhone={selected.reporter_phone}
        ticketId={selected.id}
        mode="worker"
        workerToken={token}
        onClose={() => setSelectedId(null)}
      />
    )
  }

  if (reachable.length === 0) {
    return (
      <div className="lg-glass" style={styles.empty(colors)}>
        אין דיירים עם טלפון בתקלות הפתוחות
      </div>
    )
  }

  return (
    <div style={styles.list}>
      {reachable.map((ticket) => {
        const name = ticket.reporter_name?.trim() || 'דייר'
        const phone = formatPhoneLocalIl(ticket.reporter_phone) ?? ticket.reporter_phone
        const loc = locationLine(ticket)
        return (
          <button
            key={ticket.id}
            type="button"
            style={styles.row(colors)}
            onClick={() => setSelectedId(ticket.id)}
          >
            <span style={styles.body}>
              <span style={styles.title(colors)}>{name}</span>
              <span style={styles.sub(colors)}>
                {loc || `#${ticket.ticket_number}`}
                {phone ? ` · ${phone}` : ''}
              </span>
              <span style={styles.preview(colors)}>
                {shortProblem(ticket.description?.trim() || 'תקלה פתוחה')}
              </span>
            </span>
            <span style={styles.num(colors)}>#{ticket.ticket_number}</span>
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  row: (c: typeof theme.colors): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    textAlign: 'right',
    padding: '14px 2px',
    border: 'none',
    borderBottom: `1px solid ${c.border}`,
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: 2,
  } as CSSProperties,
  title: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 16,
    fontWeight: 700,
    color: c.textPrimary,
  }),
  sub: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 13,
    color: c.textSecondary,
  }),
  preview: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 13,
    color: c.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  }),
  num: (c: typeof theme.colors): CSSProperties => ({
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 700,
    color: c.textMuted,
  }),
  empty: (c: typeof theme.colors): CSSProperties => ({
    padding: '28px 16px',
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 15,
    fontWeight: 600,
  }),
}
