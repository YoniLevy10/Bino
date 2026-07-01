'use client'

import { useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  fontSize: theme.typography.fontSize.sm,
  border: `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  outline: 'none',
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
  boxSizing: 'border-box',
  minHeight: 44,
}

type Props = {
  clientId: string
  secret: string
}

export function ClientRecoverTicketMediaPanel({ clientId, secret }: Props) {
  const [ticketNumber, setTicketNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function recover() {
    const n = Number.parseInt(ticketNumber.trim(), 10)
    if (!Number.isFinite(n) || n < 1) {
      setError('הכנס מספר תקלה')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/superadmin/ticket/recover-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ client_id: clientId, ticket_number: n }),
      })
      const json = (await res.json()) as {
        error?: string
        recovered?: boolean
        method?: string
        already_had_attachments?: boolean
        sessions_tried?: number
      }
      if (!res.ok || !json.recovered) {
        throw new Error(json.error ?? `שגיאה ${res.status}`)
      }
      if (json.already_had_attachments) {
        setMessage(`תקלה #${n} — כבר יש קבצים מצורפים`)
      } else {
        setMessage(`תקלה #${n} — המדיה שוחזרה (${json.method === 'storage_orphan' ? 'מ-storage' : 'מסשן WhatsApp'})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שחזור נכשל')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        marginBottom: theme.spacing.xl,
        background: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.xl,
        border: `1.5px solid ${theme.colors.border}`,
      }}
    >
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.sm }}>
        שחזור תמונה/וידאו לתקלה
      </div>
      <p style={{ margin: `0 0 ${theme.spacing.md}`, fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, lineHeight: 1.5 }}>
        מחפש מדיה שמורה בסשן WhatsApp של הדייר/ת (אחרי image_stashed) ומצמיד לתקלה — בלי לבקש שליחה מחדש.
      </p>
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 120px', minWidth: 100 }}>
          <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>מספר תקלה</label>
          <input
            type="number"
            min={1}
            className="sa-input"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
            placeholder="27"
            style={inputStyle}
          />
        </div>
        <LoadingButton onClick={() => void recover()} loading={loading} loadingText="משחזר…" size="sm" className="sa-touch-btn">
          שחזר מדיה
        </LoadingButton>
      </div>
      {error && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{error}</p>}
      {message && <p style={{ color: theme.colors.success, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{message}</p>}
    </div>
  )
}
