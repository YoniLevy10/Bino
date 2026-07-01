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
  direction: 'ltr',
  minHeight: 44,
}

type Props = {
  clientId: string
  defaultEmail: string | null
  secret: string
}

export function ClientInvitePanel({ clientId, defaultEmail, secret }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [role, setRole] = useState<'admin' | 'manager' | 'viewer'>('admin')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function sendInvite() {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('הכנס כתובת מייל')
      return
    }
    setSending(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ email: trimmed, role }),
      })
      const json = (await res.json()) as { error?: string; ok?: boolean; email?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setMessage(`הזמנה נשלחה ל-${json.email ?? trimmed}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginBottom: theme.spacing.xl }}>
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
        הזמנת משתמש / אדמין
      </div>
      <p style={{ margin: `0 0 ${theme.spacing.md}`, fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, lineHeight: 1.5 }}>
        שליחת הזמנה למייל — שימושי כשאין magic link או כשצריך להוסיף מנהל/צופה.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: theme.spacing.md, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>מייל</label>
          <input
            type="email"
            className="sa-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>תפקיד</label>
          <select
            className="sa-input"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'manager' | 'viewer')}
            style={{ ...inputStyle, minWidth: 120 }}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
      {error && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{error}</p>}
      {message && <p style={{ color: theme.colors.success, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{message}</p>}
      <div style={{ marginTop: theme.spacing.md }}>
        <LoadingButton onClick={() => void sendInvite()} loading={sending} loadingText="שולח..." size="sm" className="sa-touch-btn">
          שלח הזמנה
        </LoadingButton>
      </div>
    </div>
  )
}
