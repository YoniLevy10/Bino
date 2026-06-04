'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { formatAddonPriceIls } from '@/lib/paid-addons'

export type CatalogRow = {
  addon_key: string
  name_he: string
  description_he: string | null
  price_ils_monthly: number
  is_active: boolean
  sort_order: number
}

type ClientAddonRow = {
  addon_key: string
  name_he: string
  price_ils_monthly: number
  enabled: boolean
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
}

/** Global add-on pricing — Super Admin edits monthly prices. */
export function PaidAddonsCatalogAdmin({ secret }: { secret: string }) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [draft, setDraft] = useState<Record<string, { price: string; name: string; desc: string }>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/superadmin/addons/catalog', { headers: { 'x-admin-secret': secret } })
      const json = (await res.json()) as { catalog?: CatalogRow[]; error?: string }
      if (!res.ok) {
        setError(json.error || `שגיאה ${res.status}`)
        return
      }
      const rows = json.catalog || []
      setCatalog(rows)
      const d: Record<string, { price: string; name: string; desc: string }> = {}
      for (const r of rows) {
        d[r.addon_key] = {
          price: String(r.price_ils_monthly),
          name: r.name_he,
          desc: r.description_he || '',
        }
      }
      setDraft(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const items = catalog.map((row) => {
        const d = draft[row.addon_key]
        const price = parseInt(d?.price ?? '', 10)
        return {
          addon_key: row.addon_key,
          name_he: d?.name?.trim() || row.name_he,
          description_he: d?.desc?.trim() || null,
          price_ils_monthly: Number.isFinite(price) && price >= 0 ? price : row.price_ils_monthly,
        }
      })
      const res = await fetch('/api/superadmin/addons/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ items }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(json.error || 'שמירה נכשלה')
        return
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <div>
          <h2 style={titleStyle}>תוספים בתשלום — מחירון</h2>
          <p style={subStyle}>עדכון מחיר חודשי (₪) לכל תוסף. לקוחות רואים מחירים בדף חיוב.</p>
        </div>
        <LoadingButton onClick={() => void save()} loading={saving} loadingText="שומר..." size="sm">
          שמור מחירון
        </LoadingButton>
      </div>
      {error ? <p style={{ color: theme.colors.error, fontSize: 13, marginBottom: 12 }}>{error}</p> : null}
      {loading ? (
        <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>טוען מחירון...</p>
      ) : catalog.length === 0 ? (
        <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          אין תוספים — הריצו מיגרציה <code>046_paid_addons.sql</code>
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          {catalog.map((row) => {
            const d = draft[row.addon_key]
            return (
              <div key={row.addon_key} style={rowStyle}>
                <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 6, fontFamily: 'monospace' }}>
                  {row.addon_key}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>שם (עברית)</label>
                    <input
                      value={d?.name ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.addon_key]: { ...prev[row.addon_key], name: e.target.value, price: prev[row.addon_key]?.price ?? String(row.price_ils_monthly), desc: prev[row.addon_key]?.desc ?? '' },
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מחיר / חודש (₪)</label>
                    <input
                      type="number"
                      min={0}
                      value={d?.price ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.addon_key]: { ...prev[row.addon_key], price: e.target.value, name: prev[row.addon_key]?.name ?? row.name_he, desc: prev[row.addon_key]?.desc ?? '' },
                        }))
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>תיאור</label>
                  <textarea
                    value={d?.desc ?? ''}
                    rows={2}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [row.addon_key]: { ...prev[row.addon_key], desc: e.target.value, name: prev[row.addon_key]?.name ?? row.name_he, price: prev[row.addon_key]?.price ?? String(row.price_ils_monthly) },
                      }))
                    }
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: theme.colors.textMuted }}>
                  תצוגה ללקוח: {formatAddonPriceIls(parseInt(d?.price || '0', 10) || row.price_ils_monthly)}/חודש
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Per-client add-on toggles inside expanded client row. */
export function ClientPaidAddonsPanel({
  clientId,
  secret,
}: {
  clientId: string
  secret: string
}) {
  const [rows, setRows] = useState<ClientAddonRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/addons`, {
        headers: { 'x-admin-secret': secret },
      })
      const json = (await res.json()) as { addons?: ClientAddonRow[]; error?: string }
      if (!res.ok) {
        setError(json.error || 'טעינה נכשלה')
        return
      }
      setRows(json.addons || [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [clientId, secret])

  useEffect(() => {
    void load()
  }, [load])

  function toggle(key: string) {
    setRows((prev) =>
      prev.map((r) => (r.addon_key === key ? { ...r, enabled: !r.enabled } : r))
    )
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/addons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({
          addons: rows.map((r) => ({ addon_key: r.addon_key, enabled: r.enabled })),
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(json.error || 'שמירה נכשלה')
        return
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: theme.colors.textMuted }}>טוען תוספים...</p>

  return (
    <div style={{ marginBottom: theme.spacing.xl }}>
      <div style={{ fontWeight: 600, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>
        תוספים בתשלום ללקוח
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: theme.colors.textMuted }}>אין תוספים במחירון</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <label
              key={r.addon_key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: theme.colors.surface,
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border}`,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.addon_key)} />
              <span style={{ flex: 1, fontSize: 14 }}>{r.name_he}</span>
              <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                {formatAddonPriceIls(r.price_ils_monthly)}/חודש
              </span>
            </label>
          ))}
        </div>
      )}
      {error ? <p style={{ color: theme.colors.error, fontSize: 12, marginTop: 8 }}>{error}</p> : null}
      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <LoadingButton onClick={() => void save()} loading={saving} loadingText="שומר..." size="sm">
            שמור תוספים ללקוח
          </LoadingButton>
        </div>
      )}
    </div>
  )
}

const panelStyle: CSSProperties = {
  background: theme.colors.surface,
  borderRadius: theme.radius.xl,
  boxShadow: theme.shadows.md,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.xxl,
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.xl,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const subStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.textMuted,
}

const rowStyle: CSSProperties = {
  padding: theme.spacing.lg,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.muted,
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.textMuted,
  marginBottom: 4,
}
