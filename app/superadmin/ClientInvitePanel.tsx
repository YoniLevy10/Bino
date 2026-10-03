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
  secret?: string
}

export function ClientInvitePanel({ clientId, defaultEmail, secret }: Props) {
  const [mode, setMode] = useState<'password' | 'invite'>('password')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'manager' | 'viewer'>('admin')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function sendInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('הכנס כתובת מייל')
      return
    }
    if (mode === 'password' && password.length < 8) {
      setError('הסיסמה חייבת להיות באורך 8 תווים לפחות')
      return
    }
    setSending(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' as RequestCredentials,
        body: JSON.stringify(
          mode === 'password'
            ? { email: trimmed, role, mode: 'password', password }
            : { email: trimmed, role, mode: 'invite' }
        ),
      })
      const json = (await res.json()) as {
        error?: string
        ok?: boolean
        email?: string
        created?: boolean
        mode?: string
      }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      if (mode === 'password') {
        setMessage(
          json.created === false
            ? `עודכנה סיסמה ל-${json.email ?? trimmed} — אפשר להתחבר מיד`
            : `נוצר משתמש ל-${json.email ?? trimmed} — אפשר להתחבר מיד`
        )
        setPassword('')
      } else {
        setMessage(`הזמנה נשלחה ל-${json.email ?? trimmed}`)
      }
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
        מומלץ לפתוח אימייל וסיסמה ישירות — בלי קישור מהמייל. הזמנה במייל נשארת כאפשרות משנית.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: theme.spacing.md, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="sa-touch-btn"
          onClick={() => setMode('password')}
          style={{
            padding: '8px 12px',
            borderRadius: theme.radius.md,
            border: `1px solid ${mode === 'password' ? theme.colors.primary : theme.colors.border}`,
            background: mode === 'password' ? theme.colors.primary : theme.colors.surface,
            color: mode === 'password' ? '#fff' : theme.colors.textPrimary,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          אימייל וסיסמה
        </button>
        <button
          type="button"
          className="sa-touch-btn"
          onClick={() => setMode('invite')}
          style={{
            padding: '8px 12px',
            borderRadius: theme.radius.md,
            border: `1px solid ${mode === 'invite' ? theme.colors.primary : theme.colors.border}`,
            background: mode === 'invite' ? theme.colors.primary : theme.colors.surface,
            color: mode === 'invite' ? '#fff' : theme.colors.textPrimary,
            fontSize: theme.typography.fontSize.xs,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          הזמנה במייל
        </button>
      </div>
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
      {mode === 'password' && (
        <div style={{ marginTop: theme.spacing.md }}>
          <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>סיסמה</label>
          <input
            type="text"
            className="sa-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="לפחות 8 תווים"
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>
      )}
      {error && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{error}</p>}
      {message && <p style={{ color: theme.colors.success, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.sm }}>{message}</p>}
      <div style={{ marginTop: theme.spacing.md }}>
        <LoadingButton onClick={() => void sendInvite()} loading={sending} loadingText={mode === 'password' ? 'יוצר...' : 'שולח...'} size="sm" className="sa-touch-btn">
          {mode === 'password' ? 'צור משתמש עם סיסמה' : 'שלח הזמנה'}
        </LoadingButton>
      </div>
    </div>
  )
}
