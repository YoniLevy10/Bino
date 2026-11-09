'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { LoadingSpinner, type theme } from '../ui'

type HistoryTicket = {
  id: string
  ticket_number: number
  description: string | null
  status: string
  created_at: string
  closed_at: string | null
  project_id: string | null
  projects?: { name?: string | null } | { name?: string | null }[] | null
}

type Props = {
  token: string
  colors: typeof theme.colors
  refreshKey?: number
}

function projectName(ticket: HistoryTicket): string {
  const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
  return project?.name?.trim() || 'ללא בניין'
}

function whenLabel(ticket: HistoryTicket): string {
  const raw = ticket.closed_at || ticket.created_at
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('he-IL')
}

export function WorkerTicketHistoryPanel({ token, colors, refreshKey = 0 }: Props) {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<HistoryTicket[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout(
        `/api/worker/tickets?token=${encodeURIComponent(token)}&scope=history`
      )
      if (!res.ok) {
        toast.error('טעינת ההיסטוריה נכשלה')
        return
      }
      const json = (await res.json()) as { tickets?: HistoryTicket[] }
      setTickets(json.tickets || [])
    } catch {
      toast.error('טעינת ההיסטוריה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; tickets: HistoryTicket[] }>()
    for (const ticket of tickets) {
      const name = projectName(ticket)
      const key = ticket.project_id || name
      const group = map.get(key) || { name, tickets: [] }
      group.tickets.push(ticket)
      map.set(key, group)
    }
    return [...map.values()]
  }, [tickets])

  if (loading) return <LoadingSpinner />

  if (groups.length === 0) {
    return (
      <div className="lg-glass" style={styles.empty(colors)}>
        <p style={styles.emptyTitle(colors)}>אין עדיין תקלות סגורות</p>
        <p style={styles.emptySub(colors)}>תקלות שנסגרו אחרי ששויכו אליך יופיעו כאן לפי בניין.</p>
      </div>
    )
  }

  return (
    <div style={styles.list}>
      {groups.map((group) => (
        <section key={group.name} className="lg-glass" style={styles.group}>
          <h2 style={styles.groupTitle(colors)}>
            {group.name}
            <span style={styles.count(colors)}>{group.tickets.length}</span>
          </h2>
          {group.tickets.map((ticket) => (
            <div key={ticket.id} style={styles.row}>
              <div style={styles.rowTop}>
                <span style={styles.number(colors)}>#{ticket.ticket_number}</span>
                <span style={styles.when(colors)}>{whenLabel(ticket)}</span>
              </div>
              <p style={styles.desc(colors)}>{ticket.description?.trim() || 'בלי תיאור'}</p>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px 28px' } as CSSProperties,
  empty: (c: typeof theme.colors): CSSProperties => ({
    margin: '8px 12px 24px',
    padding: '28px 16px',
    textAlign: 'center',
    borderRadius: 16,
    color: c.textSecondary,
  }),
  emptyTitle: (c: typeof theme.colors): CSSProperties => ({
    margin: 0,
    fontWeight: 800,
    color: c.textPrimary,
  }),
  emptySub: (c: typeof theme.colors): CSSProperties => ({
    margin: '8px 0 0',
    fontSize: 13,
    color: c.textSecondary,
  }),
  group: { borderRadius: 16, padding: 14 } as CSSProperties,
  groupTitle: (c: typeof theme.colors): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    margin: '0 0 10px',
    fontSize: 16,
    fontWeight: 800,
    color: c.textPrimary,
  }),
  count: (c: typeof theme.colors): CSSProperties => ({
    fontSize: 12,
    fontWeight: 700,
    color: c.primary,
    background: c.primaryMuted,
    borderRadius: 999,
    padding: '2px 8px',
  }),
  row: { padding: '8px 0', borderTop: '1px solid rgba(127,127,127,0.15)' } as CSSProperties,
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 8 } as CSSProperties,
  number: (c: typeof theme.colors): CSSProperties => ({ fontWeight: 800, color: c.primary, fontSize: 13 }),
  when: (c: typeof theme.colors): CSSProperties => ({ fontSize: 12, color: c.textMuted }),
  desc: (c: typeof theme.colors): CSSProperties => ({
    margin: '4px 0 0',
    fontSize: 14,
    lineHeight: 1.4,
    color: c.textPrimary,
    wordBreak: 'break-word',
  }),
}
