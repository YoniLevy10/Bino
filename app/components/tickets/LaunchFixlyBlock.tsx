'use client'

import { useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import type { TicketFixlyMetadata } from '@/lib/fixly-types'

const TRADE_OPTIONS = ['אינסטלציה', 'חשמל', 'מיזוג', 'מעלית', 'נגרות', 'שיפוצים', 'אחר']

type Props = {
  ticketId: string
  defaultPriority?: string | null
  fixly?: TicketFixlyMetadata | null
  onLaunched: () => void | Promise<void>
}

export function LaunchFixlyBlock({ ticketId, defaultPriority, fixly, onLaunched }: Props) {
  const [trade, setTrade] = useState(TRADE_OPTIONS[0])
  const [customTrade, setCustomTrade] = useState('')
  const [sending, setSending] = useState(false)

  const active =
    fixly &&
    fixly.last_status !== 'completed' &&
    fixly.last_status !== 'cancelled' &&
    fixly.last_status !== 'expired'

  async function handleLaunch() {
    const resolvedTrade = trade === 'אחר' ? customTrade.trim() : trade
    if (!resolvedTrade) {
      toast.error('בחרו סוג מקצוע')
      return
    }
    setSending(true)
    try {
      const priority = (defaultPriority || 'MEDIUM').toUpperCase()
      const res = await fetchWithTimeout(
        '/api/tickets/launch-fixly',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_id: ticketId,
            trade: resolvedTrade,
            priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        stub?: boolean
        fixly_job_id?: string
      }
      if (!res.ok) {
        toast.error(json.error || 'הזנקת Fixly נכשלה')
        return
      }
      toast.success(json.stub ? 'קריאת Fixly נרשמה (מצב בדיקה)' : 'קריאת Fixly הוזנקה')
      await onLaunched()
    } catch {
      toast.error('שגיאת חיבור — נסו שוב')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={styles.section}>
      <div style={styles.label}>הזנקת Fixly</div>
      {active ? (
        <p style={styles.hint}>
          קריאה פעילה: {fixly.last_status}
          {fixly.trade ? ` · ${fixly.trade}` : ''}
          {fixly.professional_name ? ` · ${fixly.professional_name}` : ''}
        </p>
      ) : (
        <>
          <p style={styles.hint}>שידור קריאה פתוחה לבעלי מקצוע — מי שזמין תופס.</p>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            style={styles.select}
          >
            {TRADE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {trade === 'אחר' ? (
            <input
              value={customTrade}
              onChange={(e) => setCustomTrade(e.target.value)}
              placeholder="סוג מקצוע"
              style={styles.input}
            />
          ) : null}
          <Button type="button" onClick={() => void handleLaunch()} disabled={sending}>
            {sending ? 'מזניק…' : 'הזנק Fixly'}
          </Button>
        </>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { marginTop: 16, paddingTop: 12, borderTop: `1px solid ${theme.colors.border}` },
  label: { fontWeight: 700, fontSize: 14, marginBottom: 8, color: theme.colors.textPrimary },
  hint: { fontSize: 13, color: theme.colors.textSecondary, margin: '0 0 10px', lineHeight: 1.45 },
  select: {
    width: '100%',
    marginBottom: 8,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
  },
  input: {
    width: '100%',
    marginBottom: 8,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    boxSizing: 'border-box',
  },
}
