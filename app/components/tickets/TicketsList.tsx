'use client'

import { useState, type CSSProperties } from 'react'
import { Card, StatusBadge, SearchInput, FilterTabs, EmptyState, Button, theme } from '../ui'
import { toast } from '@/lib/error-handler'
import { TICKET_STATUSES, ticketStatusLabelHe } from '@/lib/ticket-status'

interface TicketRow {
  id: string
  ticket_number: number
  project_id?: string
  project_code?: string
  project_name?: string
  reporter_phone: string
  description: string
  status: string
  assigned_worker_id: string | null
  created_at: string
  closed_at: string | null
}

const statusOptions = ['ALL', ...TICKET_STATUSES] as const
const editableStatuses = [...TICKET_STATUSES] as const

interface TicketsListProps {
  tickets: TicketRow[]
  filteredTickets: TicketRow[]
  loading: boolean
  error: string
  searchTerm: string
  statusFilter: string
  onSearchChange: (term: string) => void
  onStatusFilterChange: (status: string) => void
  onTicketClick: (ticket: TicketRow) => void
  onCreateClick: () => void
  onRetry: () => void
  selectedTicketId?: string
  workersMap: Record<string, string>
  isMobile: boolean
  onStatusChange?: (ticketId: string, newStatus: string) => Promise<boolean>
}

export function TicketsList({
  tickets,
  filteredTickets,
  loading,
  error,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onTicketClick,
  onCreateClick,
  onRetry,
  selectedTicketId,
  workersMap,
  isMobile,
  onStatusChange,
}: TicketsListProps) {
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null)
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null)

  async function handleStatusChange(ticketId: string, newStatus: string) {
    if (!onStatusChange) return
    
    setUpdatingTicketId(ticketId)
    const success = await onStatusChange(ticketId, newStatus)
    if (success) {
      setOpenStatusDropdown(null)
    }
    setUpdatingTicketId(null)
  }

  function getTicketAge(createdAt: string): string {
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now.getTime() - created.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffDays > 0) return `${diffDays}d ago`
    if (diffHours > 0) return `${diffHours}h ago`
    return 'now'
  }
  return (
    <Card
      title="All Tickets"
      subtitle="Live operational view connected to Supabase"
      noPadding
    >
      <div style={styles.filtersRow}>
        <SearchInput
          value={searchTerm}
          onChange={onSearchChange}
          placeholder="Search tickets..."
          style={{ maxWidth: isMobile ? '100%' : '320px' }}
        />
        <FilterTabs
          options={statusOptions.map((s) => ({
            value: s,
            label: s === 'ALL' ? 'All' : s.replace('_', ' '),
          }))}
          value={statusFilter}
          onChange={onStatusFilterChange}
        />
      </div>

      {loading && (
        <div style={styles.loadingState}>
          <div style={styles.loadingSpinner} />
          <span>Loading tickets...</span>
        </div>
      )}

      {error && (
        <div style={styles.errorState}>
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && filteredTickets.length === 0 && (
        <EmptyState
          title="No tickets found"
          description="Try adjusting your filters or create a new ticket."
          action={
            <Button variant="primary" onClick={onCreateClick}>
              Create Ticket
            </Button>
          }
        />
      )}

      {!loading && !error && filteredTickets.length > 0 && (
        <div style={styles.ticketList}>
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              style={{
                ...styles.ticketRow,
                ...(selectedTicketId === ticket.id ? styles.ticketRowActive : {}),
              }}
            >
              {/* Row Header: Number | Status | Worker | Age */}
              <div style={styles.ticketRowHeader}>
                <div style={styles.ticketNumber}>#{ticket.ticket_number}</div>
                
                {/* Status - Inline Editable */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenStatusDropdown(openStatusDropdown === ticket.id ? null : ticket.id)
                    }}
                    style={{
                      ...styles.inlineEditField,
                      opacity: updatingTicketId === ticket.id ? 0.6 : 1,
                    }}
                    disabled={updatingTicketId === ticket.id}
                  >
                    {ticketStatusLabelHe(ticket.status)}
                  </button>
                  
                  {openStatusDropdown === ticket.id && (
                    <div style={styles.statusDropdown}>
                      {editableStatuses.map((status) => (
                        <button
                          key={status}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(ticket.id, status)
                          }}
                          style={{
                            ...styles.dropdownOption,
                            background: ticket.status === status ? theme.colors.primaryMuted : '#fff',
                          }}
                        >
                          {ticketStatusLabelHe(status)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Worker - Inline Display */}
                <div style={styles.workerTag}>
                  {workersMap[ticket.assigned_worker_id || ''] || '—'}
                </div>

                {/* Age */}
                <div style={styles.ticketAge}>{getTicketAge(ticket.created_at)}</div>

                {/* Project */}
                <div style={styles.ticketProject}>{ticket.project_name || '—'}</div>

                {/* Quick Actions - Open Drawer */}
                <button
                  onClick={() => onTicketClick(ticket)}
                  style={styles.quickActionButton}
                  title="Open ticket details"
                >
                  →
                </button>
              </div>

              {/* Description */}
              <div style={styles.ticketDescription}>{ticket.description || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  filtersRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '48px 20px',
    color: theme.colors.textMuted,
    fontSize: '14px',
  },
  loadingSpinner: {
    width: '20px',
    height: '20px',
    border: `2px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '48px 20px',
    color: theme.colors.error,
    fontSize: '14px',
  },
  ticketList: {
    display: 'flex',
    flexDirection: 'column',
  },
  ticketRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    transition: 'background 0.15s ease',
  },
  ticketRowActive: {
    background: theme.colors.primaryMuted,
    borderLeftColor: theme.colors.primary,
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
  },
  ticketRowHeader: {
    display: 'grid',
    gridTemplateColumns: '60px 100px 120px 60px 80px 1fr 40px',
    gap: '12px',
    alignItems: 'center',
    fontSize: '13px',
  },
  ticketNumber: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  inlineEditField: {
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    padding: '6px 10px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'center',
    width: '100%',
  },
  statusDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    background: '#fff',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    boxShadow: `0 4px 12px rgba(15, 20, 25, 0.1)`,
    zIndex: 10,
    overflow: 'hidden',
    minWidth: '120px',
  },
  dropdownOption: {
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    border: 'none',
    background: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  workerTag: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  ticketAge: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  ticketProject: {
    fontSize: '13px',
    color: theme.colors.primary,
    fontWeight: 500,
    textAlign: 'center',
  },
  quickActionButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '16px',
    color: theme.colors.textMuted,
    cursor: 'pointer',
    padding: '4px 8px',
    transition: 'color 0.15s ease',
  },
  ticketDescription: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  ticketMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
}
