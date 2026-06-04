'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { readAdminSecret, writeAdminSecret } from '@/lib/admin-secret-session'
import { PaidAddonsCatalogAdmin, ClientPaidAddonsPanel } from './PaidAddonsAdmin'
import { PlanPricingCatalogAdmin } from './PlanPricingAdmin'
import { ClientAttendanceTagsPanel } from './ClientAttendanceTagsPanel'

type Project = { id: string; name: string; project_code: string }

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
  projects: Project[]
}

type EditState = {
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string
  manager_phone: string
  sms_sender_name: string
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

function AdminQuickLinks() {
  const linkStyle: CSSProperties = {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontSize: theme.typography.fontSize.xs,
  }
  return (
    <div style={{ marginTop: theme.spacing.lg, textAlign: 'center' }}>
      <a href="/superadmin" style={linkStyle}>Super Admin</a>
      <span style={{ color: theme.colors.textMuted, margin: '0 6px' }}>·</span>
      <a href="/admin/setup" style={linkStyle}>הקמת לקוח</a>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      title={`העתק ${label ?? ''}`}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: copied ? theme.colors.success : theme.colors.textMuted, fontSize: 13, lineHeight: 1 }}
    >
      {copied ? '✓' : '📋'}
    </button>
  )
}

export default function SuperAdminPage() {
  const [secret, setSecret] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [magicLinks, setMagicLinks] = useState<Record<string, string>>({})
  const [magicLinkLoading, setMagicLinkLoading] = useState<Record<string, boolean>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const verifySecret = useCallback(async (s: string) => {
    const res = await fetch('/api/superadmin/stats', { headers: { 'x-admin-secret': s } })
    return res.ok
  }, [])

  const loadClients = useCallback(async (s: string) => {
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
  }, [])

  useEffect(() => {
    if (unlocked) void loadClients(secret)
  }, [unlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stored = readAdminSecret()
    if (!stored) return
    setSecret(stored)
    void verifySecret(stored).then((ok) => {
      if (ok) {
        setUnlocked(true)
        setUnlockError('')
      }
    })
  }, [verifySecret])

  async function handleUnlock() {
    if (!secret.trim()) {
      setUnlockError('הכנס קוד גישה')
      return
    }
    const trimmed = secret.trim()
    const ok = await verifySecret(trimmed)
    if (!ok) {
      setUnlockError('קוד גישה שגוי')
      return
    }
    writeAdminSecret(trimmed)
    setSecret(trimmed)
    setUnlocked(true)
    setUnlockError('')
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => prev === id ? null : id)
    if (editingId === id) cancelEdit()
  }

  async function getMagicLink(clientId: string, email: string) {
    setMagicLinkLoading((p) => ({ ...p, [clientId]: true }))
    try {
      const res = await fetch('/api/superadmin/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ email }),
      })
      const json = await res.json() as { link?: string; error?: string }
      if (!res.ok || !json.link) { alert(json.error ?? 'שגיאה'); return }
      setMagicLinks((p) => ({ ...p, [clientId]: json.link! }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setMagicLinkLoading((p) => ({ ...p, [clientId]: false }))
    }
  }

  function startEdit(c: ClientRow) {
    if (expandedId !== c.id) setExpandedId(c.id)
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
      const res = await fetch(`/api/superadmin/client/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({
          name: editState.name.trim() || undefined,
          plan_tier: editState.plan_tier || undefined,
          whatsapp_phone_number_id: editState.whatsapp_phone_number_id.trim() || null,
          manager_phone: editState.manager_phone.trim() || null,
          sms_sender_name: editState.sms_sender_name.trim() || null,
        }),
      })
      const json = await res.json() as { client?: ClientRow; error?: string }
      if (!res.ok) { setSaveError(json.error ?? `שגיאה ${res.status}`); return }
      if (json.client) {
        setClients((prev) => prev.map((c) =>
          c.id !== editingId ? c : { ...c, ...json.client!, buildings_count: c.buildings_count, residents_count: c.residents_count, open_tickets_count: c.open_tickets_count, projects: c.projects }
        ))
      }
      cancelEdit()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  // ── styles ──────────────────────────────────────────────────────────────────
  const pageStyle: CSSProperties = {
    minHeight: '100vh',
    background: theme.colors.background,
    padding: `${theme.spacing.xxxl} ${theme.spacing.xl}`,
    direction: 'rtl',
  }
  const cardStyle: CSSProperties = {
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    boxShadow: theme.shadows.md,
    overflow: 'hidden',
  }
  const thStyle: CSSProperties = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    textAlign: 'right',
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.xs,
    borderBottom: `1.5px solid ${theme.colors.border}`,
    whiteSpace: 'nowrap',
    background: theme.colors.muted,
  }
  const tdStyle: CSSProperties = {
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    verticalAlign: 'middle',
  }

  // ── Lock screen ──────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div style={{ ...pageStyle, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: theme.colors.surface, borderRadius: theme.radius.xl, padding: theme.spacing.xxl, boxShadow: theme.shadows.md, width: '100%', maxWidth: 380, marginTop: 80 }}>
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
          {unlockError && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>{unlockError}</p>}
          <LoadingButton
            onClick={handleUnlock}
            style={{ width: '100%' }}
          >
            כניסה
          </LoadingButton>
          <AdminQuickLinks />
        </div>
      </div>
    )
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xxl }}>
          <h1 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.textPrimary, margin: 0 }}>
            Super Admin — לקוחות
          </h1>
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button
              onClick={() => void loadClients(secret)}
              disabled={loading}
              style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}
            >
              {loading ? 'טוען...' : 'רענן'}
            </button>
            <a
              href="/admin/setup"
              style={{ background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.md, padding: '8px 18px', cursor: 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              + הקם לקוח חדש
            </a>
          </div>
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

        <PlanPricingCatalogAdmin secret={secret} />
        <PaidAddonsCatalogAdmin secret={secret} />

        {/* Table */}
        <div style={cardStyle}>
          {loading && clients.length === 0 ? (
            <p style={{ color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl }}>טוען...</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['', 'שם לקוח', 'מייל אדמין', 'תכנית', 'WhatsApp', 'טלפון מנהל', 'SMS שולח', 'בניינים', 'דיירים', 'קריאות', ''].map((h, i) => (
                      <th key={i} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <>
                      {/* Main row */}
                      <tr
                        key={c.id}
                        style={{ background: expandedId === c.id ? theme.colors.primaryMuted : 'transparent', transition: 'background 0.15s' }}
                      >
                        {/* Expand toggle */}
                        <td style={{ ...tdStyle, width: 36, textAlign: 'center', paddingLeft: 8, paddingRight: 8 }}>
                          <button
                            onClick={() => toggleExpand(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, fontSize: 11, padding: 4, borderRadius: 4, transition: 'transform 0.15s', transform: expandedId === c.id ? 'rotate(90deg)' : 'none' }}
                            title={expandedId === c.id ? 'סגור' : 'פרט'}
                          >
                            ▶
                          </button>
                        </td>

                        {/* Name + copy ID */}
                        <td style={{ ...tdStyle, fontWeight: theme.typography.fontWeight.semibold, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {c.name}
                            <CopyButton text={c.id} label="Client ID" />
                          </div>
                        </td>

                        {/* Admin email */}
                        <td style={{ ...tdStyle, fontSize: theme.typography.fontSize.xs, direction: 'ltr' }}>
                          {c.admin_email
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span>{c.admin_email}</span><CopyButton text={c.admin_email} /></div>
                            : <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>

                        {/* Plan badge */}
                        <td style={tdStyle}>
                          <span style={{ background: PLAN_COLORS[c.plan_tier] ?? '#6b7280', color: '#fff', borderRadius: theme.radius.xs, padding: '2px 8px', fontSize: theme.typography.fontSize.xs, fontWeight: 600 }}>
                            {PLAN_LABELS[c.plan_tier] ?? c.plan_tier}
                          </span>
                        </td>

                        {/* WA status */}
                        <td style={{ ...tdStyle, direction: 'ltr', fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs }}>
                          {c.whatsapp_phone_number_id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: theme.colors.success, fontSize: 8 }}>●</span>
                              <span title={c.whatsapp_phone_number_id} style={{ color: theme.colors.textPrimary }}>
                                {c.whatsapp_phone_number_id.length > 14 ? c.whatsapp_phone_number_id.slice(0, 12) + '…' : c.whatsapp_phone_number_id}
                              </span>
                              <CopyButton text={c.whatsapp_phone_number_id} label="WA Phone ID" />
                            </div>
                          ) : (
                            <span style={{ color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 8 }}>●</span> לא מחובר
                            </span>
                          )}
                        </td>

                        {/* Manager phone */}
                        <td style={{ ...tdStyle, direction: 'ltr', fontSize: theme.typography.fontSize.xs }}>
                          {c.manager_phone ?? <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>

                        {/* SMS sender */}
                        <td style={{ ...tdStyle, fontSize: theme.typography.fontSize.xs }}>
                          {c.sms_sender_name ?? <span style={{ color: theme.colors.textMuted }}>—</span>}
                        </td>

                        {/* Buildings */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{c.buildings_count}</td>

                        {/* Residents */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{c.residents_count}</td>

                        {/* Open tickets */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {c.open_tickets_count > 0
                            ? <span style={{ color: theme.colors.warning, fontWeight: 600 }}>{c.open_tickets_count}</span>
                            : <span style={{ color: theme.colors.textMuted }}>0</span>}
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          {editingId === c.id ? (
                            <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, fontSize: theme.typography.fontSize.xs }}>ביטול</button>
                          ) : (
                            <button
                              onClick={() => startEdit(c)}
                              style={{ background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.xs, padding: '4px 10px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.xs }}
                            >
                              ערוך
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {expandedId === c.id && (
                        <tr key={`${c.id}-expand`}>
                          <td colSpan={11} style={{ padding: 0, borderBottom: `1px solid ${theme.colors.borderSubtle}` }}>
                            <div style={{ background: theme.colors.muted, padding: theme.spacing.xl, direction: 'rtl' }}>

                              {/* Edit form */}
                              {editingId === c.id && editState && (
                                <div style={{ marginBottom: theme.spacing.xl, background: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.xl, border: `1.5px solid ${theme.colors.border}` }}>
                                  <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }}>עריכת פרטי לקוח</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
                                    {[
                                      { label: 'שם לקוח', key: 'name' as const, placeholder: '' },
                                      { label: 'WA Phone Number ID', key: 'whatsapp_phone_number_id' as const, placeholder: 'ריק = ללא WhatsApp' },
                                      { label: 'טלפון מנהל', key: 'manager_phone' as const, placeholder: '972501234567' },
                                      { label: 'שם שולח SMS', key: 'sms_sender_name' as const, placeholder: 'Bamakor' },
                                    ].map(({ label, key, placeholder }) => (
                                      <div key={key}>
                                        <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>{label}</label>
                                        <input
                                          value={editState[key]}
                                          onChange={(e) => setEditState((s) => s ? { ...s, [key]: e.target.value } : s)}
                                          placeholder={placeholder}
                                          style={inputStyle}
                                        />
                                      </div>
                                    ))}
                                    <div>
                                      <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>תכנית</label>
                                      <select value={editState.plan_tier} onChange={(e) => setEditState((s) => s ? { ...s, plan_tier: e.target.value } : s)} style={inputStyle}>
                                        {['starter', 'pro', 'business', 'enterprise'].map((p) => (
                                          <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  {saveError && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.md }}>{saveError}</p>}
                                  <div style={{ display: 'flex', gap: theme.spacing.md }}>
                                    <LoadingButton
                                      onClick={saveEdit}
                                      loading={saving}
                                      loadingText="שומר..."
                                      size="sm"
                                    >
                                      שמור
                                    </LoadingButton>
                                    <button onClick={cancelEdit} style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}>
                                      ביטול
                                    </button>
                                  </div>
                                </div>
                              )}

                              <ClientPaidAddonsPanel clientId={c.id} secret={secret} />

                              <ClientAttendanceTagsPanel
                                clientId={c.id}
                                secret={secret}
                                projects={c.projects}
                              />

                              {/* Projects list */}
                              <div style={{ marginBottom: theme.spacing.xl }}>
                                <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
                                  בניינים ({c.projects.length})
                                </div>
                                {c.projects.length === 0 ? (
                                  <p style={{ color: theme.colors.textMuted, fontSize: theme.typography.fontSize.sm }}>אין בניינים</p>
                                ) : (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                                    {c.projects.map((p) => (
                                      <div key={p.id} style={{ background: theme.colors.surface, borderRadius: theme.radius.md, padding: `${theme.spacing.xs} ${theme.spacing.md}`, border: `1px solid ${theme.colors.border}`, fontSize: theme.typography.fontSize.xs, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <code style={{ color: theme.colors.textMuted, fontSize: 10 }}>{p.project_code}</code>
                                        <span style={{ color: theme.colors.textPrimary }}>{p.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Magic link */}
                              {c.admin_email && (
                                <div>
                                  <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
                                    כניסה כלקוח
                                  </div>
                                  {magicLinks[c.id] ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, background: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, border: `1px solid ${theme.colors.border}` }}>
                                      <code style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, direction: 'ltr' }}>
                                        {magicLinks[c.id]}
                                      </code>
                                      <CopyButton text={magicLinks[c.id]!} label="קישור" />
                                      <a href={magicLinks[c.id]} target="_blank" rel="noreferrer" style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.primary, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                        פתח ↗
                                      </a>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => void getMagicLink(c.id, c.admin_email!)}
                                      disabled={magicLinkLoading[c.id]}
                                      style={{ background: magicLinkLoading[c.id] ? theme.colors.textMuted : theme.colors.surface, border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: magicLinkLoading[c.id] ? 'not-allowed' : 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}
                                    >
                                      {magicLinkLoading[c.id] ? 'יוצר קישור...' : '🔑 צור Magic Link'}
                                    </button>
                                  )}
                                </div>
                              )}
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
