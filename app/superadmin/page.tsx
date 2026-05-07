'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { theme } from '../components/ui'

type ClientRow = {
  id: string
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string | null
  manager_phone: string | null
  sms_sender_name: string | null
  admin_email: string | null
  buildings_count: number
  residents_count: number
  open_tickets_count: number
}

type EditState = {
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string
  manager_phone: string
  sms_sender_name: string
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: theme.typography.fontSize.sm,
  border: `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  outline: 'none',
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
  boxSizing: 'border-box',
  direction: 'ltr',
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#6b7280',
  pro: '#2563eb',
  business: '#7c3aed',
  enterprise: '#b45309',
}

export default function SuperAdminPage() {
  const [secret, setSecret] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function handleUnlock() {
    if (!secret.trim()) { setUnlockError('הכנס קוד גישה'); return }
    setUnlocked(true)
    setUnlockError('')
  }

  async function loadClients(s: string) {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/superadmin/stats', { headers: { 'x-admin-secret': s } })
      const json = await res.json() as { clients?: ClientRow[]; error?: string }
      if (!res.ok) { setLoadError(json.error ?? `שגיאה ${res.status}`); return }
      setClients(json.clients ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (unlocked) void loadClients(secret)
  }, [unlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(c: ClientRow) {
    setEditingId(c.id)
    setSaveError('')
    setEditState({
      name: c.name,
      plan_tier: c.plan_tier,
      whatsapp_phone_number_id: c.whatsapp_phone_number_id ?? '',
      manager_phone: c.manager_phone ?? '',
      sms_sender_name: c.sms_sender_name ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
    setSaveError('')
  }

  async function saveEdit() {
    if (!editingId || !editState) return
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        name: editState.name.trim() || undefined,
        plan_tier: editState.plan_tier || undefined,
        whatsapp_phone_number_id: editState.whatsapp_phone_number_id.trim() || null,
        manager_phone: editState.manager_phone.trim() || null,
        sms_sender_name: editState.sms_sender_name.trim() || null,
      }
      const res = await fetch(`/api/superadmin/client/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { client?: ClientRow; error?: string }
      if (!res.ok) { setSaveError(json.error ?? `שגיאה ${res.status}`); return }
      if (json.client) {
        setClients((prev) => prev.map((c) => {
          if (c.id !== editingId) return c
          return { ...c, ...json.client!, buildings_count: c.buildings_count, residents_count: c.residents_count, open_tickets_count: c.open_tickets_count }
        }))
      }
      cancelEdit()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const pageStyle: CSSProperties = {
    minHeight: '100vh',
    background: theme.colors.background,
    padding: `${theme.spacing.xxxl} ${theme.spacing.xl}`,
    direction: 'rtl',
  }
  const cardStyle: CSSProperties = {
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xxl,
    boxShadow: theme.shadows.md,
  }
  const thStyle: CSSProperties = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    textAlign: 'right',
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.xs,
    borderBottom: `1.5px solid ${theme.colors.border}`,
    whiteSpace: 'nowrap',
  }
  const tdStyle: CSSProperties = {
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    verticalAlign: 'top',
  }

  // ── Lock screen ────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div style={{ ...pageStyle, display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...cardStyle, width: '100%', maxWidth: 380, marginTop: 80 }}>
          <h1 style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, textAlign: 'center', marginBottom: theme.spacing.xl, color: theme.colors.textPrimary }}>
            Super Admin
          </h1>
          <div style={{ marginBottom: theme.spacing.lg }}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="קוד גישה..."
              style={inputStyle}
              autoFocus
            />
          </div>
          {unlockError && (
            <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>{unlockError}</p>
          )}
          <button
            onClick={handleUnlock}
            style={{ width: '100%', padding: '12px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.md, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, cursor: 'pointer' }}
          >
            כניסה
          </button>
        </div>
      </div>
    )
  }

  // ── Main ────────────────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xxl }}>
          <h1 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.textPrimary, margin: 0 }}>
            Super Admin — לקוחות
          </h1>
          <button
            onClick={() => void loadClients(secret)}
            disabled={loading}
            style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}
          >
            {loading ? 'טוען...' : 'רענן'}
          </button>
        </div>

        {/* Stats bar */}
        {clients.length > 0 && (
          <div style={{ display: 'flex', gap: theme.spacing.lg, marginBottom: theme.spacing.xl, flexWrap: 'wrap' }}>
            {[
              { label: 'לקוחות', value: clients.length },
              { label: 'בניינים', value: clients.reduce((s, c) => s + c.buildings_count, 0) },
              { label: 'דיירים', value: clients.reduce((s, c) => s + c.residents_count, 0) },
              { label: 'קריאות פתוחות', value: clients.reduce((s, c) => s + c.open_tickets_count, 0) },
            ].map((s) => (
              <div key={s.label} style={{ background: theme.colors.primaryMuted, borderRadius: theme.radius.md, padding: `${theme.spacing.md} ${theme.spacing.xl}`, textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.primary }}>{s.value}</div>
                <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {loadError && (
          <div style={{ background: theme.colors.errorMuted, border: `1.5px solid ${theme.colors.error}`, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.xl, color: theme.colors.error, fontSize: theme.typography.fontSize.sm }}>
            {loadError}
          </div>
        )}

        {/* Clients table */}
        <div style={cardStyle}>
          {loading && clients.length === 0 ? (
            <p style={{ color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl }}>טוען...</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['שם לקוח', 'מייל אדמין', 'תכנית', 'WA Phone ID', 'מנהל (טלפון)', 'SMS שולח', 'בניינים', 'דיירים', 'קריאות פתוחות', ''].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <>
                      {/* Data row */}
                      <tr key={c.id} style={{ background: editingId === c.id ? theme.colors.primaryMuted : 'transparent' }}>
                        <td style={{ ...tdStyle, fontWeight: theme.typography.fontWeight.semibold }}>{c.name}</td>
                        <td style={{ ...tdStyle, fontSize: theme.typography.fontSize.xs, direction: 'ltr' }}>
                          {c.admin_email ?? <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: PLAN_COLORS[c.plan_tier] ?? '#6b7280', color: '#fff', borderRadius: theme.radius.xs, padding: '2px 8px', fontSize: theme.typography.fontSize.xs, fontWeight: 600 }}>
                            {PLAN_LABELS[c.plan_tier] ?? c.plan_tier}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, direction: 'ltr', fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs }}>
                          {c.whatsapp_phone_number_id ? (
                            <span title={c.whatsapp_phone_number_id} style={{ color: theme.colors.success }}>
                              {c.whatsapp_phone_number_id.length > 16 ? c.whatsapp_phone_number_id.slice(0, 14) + '…' : c.whatsapp_phone_number_id}
                            </span>
                          ) : <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, direction: 'ltr', fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs }}>
                          {c.manager_phone ?? <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: theme.typography.fontSize.xs }}>
                          {c.sms_sender_name ?? <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{c.buildings_count}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{c.residents_count}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {c.open_tickets_count > 0
                            ? <span style={{ color: theme.colors.warning, fontWeight: 600 }}>{c.open_tickets_count}</span>
                            : <span style={{ color: theme.colors.textMuted }}>0</span>}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          {editingId === c.id ? (
                            <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, fontSize: theme.typography.fontSize.xs }}>ביטול</button>
                          ) : (
                            <button onClick={() => startEdit(c)} style={{ background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.xs, padding: '4px 10px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.xs }}>ערוך</button>
                          )}
                        </td>
                      </tr>

                      {/* Inline edit row */}
                      {editingId === c.id && editState && (
                        <tr key={`${c.id}-edit`}>
                          <td colSpan={10} style={{ ...tdStyle, background: theme.colors.muted, padding: theme.spacing.xl }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
                              <div>
                                <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>שם לקוח</label>
                                <input value={editState.name} onChange={(e) => setEditState((s) => s ? { ...s, name: e.target.value } : s)} style={inputStyle} />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>תכנית</label>
                                <select value={editState.plan_tier} onChange={(e) => setEditState((s) => s ? { ...s, plan_tier: e.target.value } : s)} style={{ ...inputStyle }}>
                                  {['starter', 'pro', 'business', 'enterprise'].map((p) => (
                                    <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>WA Phone Number ID</label>
                                <input value={editState.whatsapp_phone_number_id} onChange={(e) => setEditState((s) => s ? { ...s, whatsapp_phone_number_id: e.target.value } : s)} placeholder="ריק = ללא WhatsApp" style={inputStyle} />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>טלפון מנהל</label>
                                <input value={editState.manager_phone} onChange={(e) => setEditState((s) => s ? { ...s, manager_phone: e.target.value } : s)} placeholder="972501234567" style={inputStyle} />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>שם שולח SMS</label>
                                <input value={editState.sms_sender_name} onChange={(e) => setEditState((s) => s ? { ...s, sms_sender_name: e.target.value } : s)} placeholder="Bamakor" style={inputStyle} />
                              </div>
                            </div>
                            {saveError && (
                              <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.md }}>{saveError}</p>
                            )}
                            <div style={{ display: 'flex', gap: theme.spacing.md }}>
                              <button
                                onClick={() => void saveEdit()}
                                disabled={saving}
                                style={{ background: saving ? theme.colors.textMuted : theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.md, padding: '8px 20px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold }}
                              >
                                {saving ? 'שומר...' : 'שמור'}
                              </button>
                              <button onClick={cancelEdit} style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}>
                                ביטול
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              {clients.length === 0 && !loading && (
                <p style={{ color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl }}>אין לקוחות</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
