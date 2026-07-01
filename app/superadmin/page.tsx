'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { readAdminSecret, writeAdminSecret } from '@/lib/admin-secret-session'
import { PaidAddonsCatalogAdmin, ClientPaidAddonsPanel } from './PaidAddonsAdmin'
import { PlanPricingCatalogAdmin } from './PlanPricingAdmin'
import { ClientAttendanceTagsPanel } from './ClientAttendanceTagsPanel'
import { ClientLogoUpload } from './ClientLogoUpload'
import { SuperadminOpsPanel } from '@/app/components/superadmin/SuperadminOpsPanel'
import { MetaWhatsAppPendingPanel } from '@/app/components/settings/MetaWhatsAppPendingPanel'
import { PLAN_SETUP_OPTIONS, planLimitsLine } from '@/lib/plan-display'
import {
  effectiveMaxBuildings,
  effectiveMaxTicketsPerMonth,
  effectiveMaxWorkers,
  normalizeTier,
  type PlanTier,
} from '@/lib/plan-limits'
import { DEFAULT_SIDEBAR_NAV_ORDER, type SidebarNavItemId } from '@/lib/sidebar-nav'
import {
  coreNavFeatureOptions,
  describeClientNavFeaturesMode,
  parseEnabledNavFeaturesFromDb,
  REQUIRED_NAV_FEATURE_IDS,
  SETUP_PACKAGE_NAV_FEATURE_IDS,
  type ClientNavFeaturesMode,
} from '@/lib/client-nav-features'

type PlanCatalogRow = {
  plan_tier: string
  workers_max: number | null
  buildings_max: number | null
  tickets_per_month_max: number | null
}

function parseOptionalLimitInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 1) throw new Error('מכסות חייבות להיות מספר חיובי')
  return Math.floor(n)
}

function formatEffectiveLimit(value: number | null): string {
  return value == null ? 'ללא הגבלה' : value.toLocaleString('he-IL')
}

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
  workers_active_count: number
  workers_total_count: number
  max_workers: number | null
  buildings_allowed: number | null
  max_tickets_per_month: number | null
  projects: Project[]
  enabled_nav_features: SidebarNavItemId[] | null
  logo_url?: string | null
}

type EditState = {
  name: string
  plan_tier: string
  whatsapp_phone_number_id: string
  manager_phone: string
  sms_sender_name: string
  max_workers: string
  buildings_allowed: string
  max_tickets_per_month: string
}

function previewClientLimits(
  editState: EditState,
  catalog: PlanCatalogRow[]
): { workers: number | null; buildings: number | null; tickets: number | null } {
  const tier = normalizeTier(editState.plan_tier)
  const catalogRow = catalog.find((row) => row.plan_tier === tier) ?? null
  let maxWorkers: number | null = null
  let maxBuildings: number | null = null
  let maxTickets: number | null = null
  try {
    maxWorkers = parseOptionalLimitInput(editState.max_workers)
    maxBuildings = parseOptionalLimitInput(editState.buildings_allowed)
    maxTickets = parseOptionalLimitInput(editState.max_tickets_per_month)
  } catch {
    return { workers: null, buildings: null, tickets: null }
  }
  const clientRow = {
    id: '',
    plan_tier: editState.plan_tier,
    max_workers: maxWorkers,
    buildings_allowed: maxBuildings,
    max_tickets_per_month: maxTickets,
  }
  return {
    workers: effectiveMaxWorkers(clientRow, catalogRow),
    buildings: effectiveMaxBuildings(clientRow, catalogRow),
    tickets: effectiveMaxTicketsPerMonth(clientRow, catalogRow),
  }
}

function effectiveLimitsForClient(client: ClientRow, catalog: PlanCatalogRow[]) {
  const tier = normalizeTier(client.plan_tier)
  const catalogRow = catalog.find((row) => row.plan_tier === tier) ?? null
  const clientRow = {
    id: client.id,
    plan_tier: client.plan_tier,
    max_workers: client.max_workers,
    buildings_allowed: client.buildings_allowed,
    max_tickets_per_month: client.max_tickets_per_month,
  }
  return {
    workers: effectiveMaxWorkers(clientRow, catalogRow),
    buildings: effectiveMaxBuildings(clientRow, catalogRow),
    tickets: effectiveMaxTicketsPerMonth(clientRow, catalogRow),
  }
}

type ViewMode = 'clients' | 'ops'

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

const NAV_FEATURES_MODE_BADGE: Record<ClientNavFeaturesMode, { label: string; bg: string }> = {
  legacy_unlimited: { label: 'לגסי · הכל', bg: '#6b7280' },
  setup_package: { label: 'חבילת הקמה', bg: '#b45309' },
  custom_restricted: { label: 'מותאם', bg: '#7c3aed' },
}

function NavFeaturesModeBadge({ mode }: { mode: ClientNavFeaturesMode }) {
  const badge = NAV_FEATURES_MODE_BADGE[mode]
  return (
    <span
      style={{
        background: badge.bg,
        color: '#fff',
        borderRadius: theme.radius.xs,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      title="מצב הרשאות לשוניות"
    >
      {badge.label}
    </span>
  )
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
  const [planCatalog, setPlanCatalog] = useState<PlanCatalogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [magicLinks, setMagicLinks] = useState<Record<string, string>>({})
  const [magicLinkLoading, setMagicLinkLoading] = useState<Record<string, boolean>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [featuresDraft, setFeaturesDraft] = useState<SidebarNavItemId[]>([...DEFAULT_SIDEBAR_NAV_ORDER])
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [featuresError, setFeaturesError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [viewMode, setViewMode] = useState<ViewMode>('clients')

  const verifySecret = useCallback(async (s: string) => {
    const res = await fetch('/api/superadmin/stats', { headers: { 'x-admin-secret': s } })
    return res.ok
  }, [])

  const loadClients = useCallback(async (s: string) => {
    setLoading(true)
    setLoadError('')
    try {
      const [statsRes, pricingRes] = await Promise.all([
        fetch('/api/superadmin/stats', { headers: { 'x-admin-secret': s } }),
        fetch('/api/superadmin/plans/pricing', { headers: { 'x-admin-secret': s } }),
      ])
      const statsJson = await statsRes.json() as { clients?: ClientRow[]; error?: string }
      const pricingJson = await pricingRes.json() as { catalog?: PlanCatalogRow[]; error?: string }
      if (!statsRes.ok) { setLoadError(statsJson.error ?? `שגיאה ${statsRes.status}`); return }
      setClients(statsJson.clients ?? [])
      if (pricingRes.ok) setPlanCatalog(pricingJson.catalog ?? [])
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

  function enabledFeaturesForUi(raw: SidebarNavItemId[] | null): SidebarNavItemId[] {
    return raw?.length ? raw : [...DEFAULT_SIDEBAR_NAV_ORDER]
  }

  function toggleExpand(c: ClientRow) {
    const next = expandedId === c.id ? null : c.id
    setExpandedId(next)
    if (editingId === c.id) cancelEdit()
    if (next === c.id) {
      setFeaturesDraft(enabledFeaturesForUi(c.enabled_nav_features))
      setFeaturesError('')
      setDeleteTarget(null)
      setDeleteConfirmName('')
      setDeleteError('')
    }
  }

  function toggleFeatureDraft(id: SidebarNavItemId, checked: boolean) {
    if (REQUIRED_NAV_FEATURE_IDS.includes(id)) return
    setFeaturesDraft((prev) => {
      const set = new Set(prev)
      if (checked) set.add(id)
      else set.delete(id)
      for (const required of REQUIRED_NAV_FEATURE_IDS) set.add(required)
      return DEFAULT_SIDEBAR_NAV_ORDER.filter((fid) => set.has(fid))
    })
  }

  function applySetupPackagePreset() {
    setFeaturesDraft([...SETUP_PACKAGE_NAV_FEATURE_IDS])
  }

  function applyAllFeaturesPreset() {
    setFeaturesDraft([...DEFAULT_SIDEBAR_NAV_ORDER])
  }

  async function clearFeatureRestrictions(clientId: string) {
    setSavingFeatures(true)
    setFeaturesError('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ enabled_nav_features: null }),
      })
      const json = await res.json() as { client?: ClientRow; error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setClients((prev) =>
        prev.map((row) =>
          row.id !== clientId ? row : { ...row, enabled_nav_features: null }
        )
      )
      setFeaturesDraft([...DEFAULT_SIDEBAR_NAV_ORDER])
    } catch (e) {
      setFeaturesError(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function saveFeatures(clientId: string) {
    setSavingFeatures(true)
    setFeaturesError('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ enabled_nav_features: featuresDraft }),
      })
      const json = await res.json() as { client?: ClientRow; error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      if (json.client) {
        setClients((prev) =>
          prev.map((c) =>
            c.id !== clientId
              ? c
              : {
                  ...c,
                  enabled_nav_features: parseEnabledNavFeaturesFromDb(json.client!.enabled_nav_features),
                }
          )
        )
        setFeaturesDraft(enabledFeaturesForUi(parseEnabledNavFeaturesFromDb(json.client.enabled_nav_features)))
      }
    } catch (e) {
      setFeaturesError(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function deleteClient() {
    if (!deleteTarget) return
    if (deleteConfirmName.trim() !== deleteTarget.name.trim()) {
      setDeleteError('יש להקליד את שם הלקוח בדיוק לאישור')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/superadmin/client/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': secret },
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setExpandedId(null)
      setDeleteTarget(null)
      setDeleteConfirmName('')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'מחיקה נכשלה')
    } finally {
      setDeleting(false)
    }
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
      max_workers: c.max_workers != null ? String(c.max_workers) : '',
      buildings_allowed: c.buildings_allowed != null ? String(c.buildings_allowed) : '',
      max_tickets_per_month: c.max_tickets_per_month != null ? String(c.max_tickets_per_month) : '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
    setSaveError('')
  }

  function clearLimitOverridesInEdit() {
    setEditState((s) =>
      s
        ? {
            ...s,
            max_workers: '',
            buildings_allowed: '',
            max_tickets_per_month: '',
          }
        : s
    )
  }

  function onPlanTierChange(nextTier: string) {
    setEditState((s) =>
      s
        ? {
            ...s,
            plan_tier: nextTier,
            max_workers: '',
            buildings_allowed: '',
            max_tickets_per_month: '',
          }
        : s
    )
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
          max_workers: parseOptionalLimitInput(editState.max_workers),
          buildings_allowed: parseOptionalLimitInput(editState.buildings_allowed),
          max_tickets_per_month: parseOptionalLimitInput(editState.max_tickets_per_month),
        }),
      })
      const json = await res.json() as { client?: ClientRow; error?: string }
      if (!res.ok) { setSaveError(json.error ?? `שגיאה ${res.status}`); return }
      if (json.client) {
        setClients((prev) => prev.map((c) =>
          c.id !== editingId ? c : {
            ...c,
            ...json.client!,
            buildings_count: c.buildings_count,
            residents_count: c.residents_count,
            open_tickets_count: c.open_tickets_count,
            workers_active_count: c.workers_active_count,
            workers_total_count: c.workers_total_count,
            projects: c.projects,
          }
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.lg, flexWrap: 'wrap', gap: theme.spacing.md }}>
          <h1 style={{ fontSize: theme.typography.fontSize['3xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.textPrimary, margin: 0 }}>
            Super Admin
          </h1>
          <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
            {viewMode === 'clients' && (
              <button
                onClick={() => void loadClients(secret)}
                disabled={loading}
                style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}
              >
                {loading ? 'טוען...' : 'רענן'}
              </button>
            )}
            <a
              href="/admin/setup"
              style={{ background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.radius.md, padding: '8px 18px', cursor: 'pointer', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              + הקם לקוח חדש
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.xl }}>
          {(
            [
              { id: 'clients' as const, label: 'לקוחות' },
              { id: 'ops' as const, label: 'תפעול' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewMode(tab.id)}
              style={{
                padding: '10px 18px',
                borderRadius: theme.radius.md,
                border: `1.5px solid ${viewMode === tab.id ? theme.colors.primary : theme.colors.border}`,
                background: viewMode === tab.id ? theme.colors.primaryMuted : theme.colors.surface,
                color: viewMode === tab.id ? theme.colors.primary : theme.colors.textSecondary,
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {viewMode === 'ops' && (
          <>
            <SuperadminOpsPanel adminSecret={secret} />
            <div style={{ marginTop: 24 }}>
              <MetaWhatsAppPendingPanel />
            </div>
            <AdminQuickLinks />
          </>
        )}

        {viewMode === 'clients' && (
          <>
        {/* Stats bar */}
        {clients.length > 0 && (
          <div style={{ display: 'flex', gap: theme.spacing.lg, marginBottom: theme.spacing.xl, flexWrap: 'wrap' }}>
            {[
              { label: 'לקוחות', value: clients.length },
              { label: 'בניינים', value: clients.reduce((s, c) => s + c.buildings_count, 0) },
              { label: 'עובדים', value: clients.reduce((s, c) => s + c.workers_active_count, 0) },
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
                    {['', 'שם לקוח', 'מייל אדמין', 'תכנית', 'WhatsApp', 'טלפון מנהל', 'SMS שולח', 'בניינים', 'עובדים', 'דיירים', 'קריאות', ''].map((h, i) => (
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
                            onClick={() => toggleExpand(c)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted, fontSize: 11, padding: 4, borderRadius: 4, transition: 'transform 0.15s', transform: expandedId === c.id ? 'rotate(90deg)' : 'none' }}
                            title={expandedId === c.id ? 'סגור' : 'פרט'}
                          >
                            ▶
                          </button>
                        </td>

                        {/* Name + copy ID */}
                        <td style={{ ...tdStyle, fontWeight: theme.typography.fontWeight.semibold, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {c.name}
                            <NavFeaturesModeBadge mode={describeClientNavFeaturesMode(c.enabled_nav_features)} />
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

                        {/* Workers */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {(() => {
                            const limits = effectiveLimitsForClient(c, planCatalog)
                            const cap = limits.workers
                            return cap != null ? `${c.workers_active_count}/${cap}` : c.workers_active_count
                          })()}
                        </td>

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
                          <td colSpan={12} style={{ padding: 0, borderBottom: `1px solid ${theme.colors.borderSubtle}` }}>
                            <div style={{ background: theme.colors.muted, padding: theme.spacing.xl, direction: 'rtl' }}>

                              {/* Edit form */}
                              {editingId === c.id && editState && (() => {
                                const preview = previewClientLimits(editState, planCatalog)
                                return (
                                <div style={{ marginBottom: theme.spacing.xl, background: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.xl, border: `1.5px solid ${theme.colors.border}` }}>
                                  <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg }}>
                                    עריכת לקוח — מכסות וחבילה
                                  </div>
                                  <p style={{ margin: '0 0 16px', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                                    כאן מגדירים את החבילה והמכסות שחלות על הלקוח. שינוי תכנית מאפס מכסות מותאמות ישנות.
                                    מכסות מטאב &quot;מנוי ותמחור&quot; נאכפות אוטומטית כשאין override.
                                  </p>
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
                                      <select value={editState.plan_tier} onChange={(e) => onPlanTierChange(e.target.value)} style={inputStyle}>
                                        {PLAN_SETUP_OPTIONS.map((p) => (
                                          <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                      </select>
                                      <p style={{ margin: '4px 0 0', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>
                                        ברירת מחדל בקוד: {planLimitsLine(normalizeTier(editState.plan_tier) as PlanTier)}
                                      </p>
                                      <p style={{ margin: '4px 0 0', fontSize: theme.typography.fontSize.xs, color: theme.colors.textSecondary }}>
                                        עובדים פעילים כעת: {c.workers_active_count}
                                        {c.max_workers != null ? ` · override שמור: ${c.max_workers}` : ''}
                                      </p>
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>מכסת עובדים (override)</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editState.max_workers}
                                        onChange={(e) => setEditState((s) => s ? { ...s, max_workers: e.target.value } : s)}
                                        placeholder="ריק = לפי תכנית"
                                        style={inputStyle}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>מכסת בניינים (override)</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editState.buildings_allowed}
                                        onChange={(e) => setEditState((s) => s ? { ...s, buildings_allowed: e.target.value } : s)}
                                        placeholder="ריק = לפי תכנית"
                                        style={inputStyle}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted, marginBottom: 4 }}>מכסת תקלות/חודש (override)</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editState.max_tickets_per_month}
                                        onChange={(e) => setEditState((s) => s ? { ...s, max_tickets_per_month: e.target.value } : s)}
                                        placeholder="ריק = לפי תכנית"
                                        style={inputStyle}
                                      />
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      marginBottom: theme.spacing.lg,
                                      padding: '12px 14px',
                                      borderRadius: theme.radius.md,
                                      background: theme.colors.primaryMuted,
                                      fontSize: theme.typography.fontSize.xs,
                                      color: theme.colors.textPrimary,
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    <strong>מכסה בפועל אחרי שמירה:</strong>{' '}
                                    עובדים {formatEffectiveLimit(preview.workers)} · בניינים {formatEffectiveLimit(preview.buildings)} · תקלות/חודש {formatEffectiveLimit(preview.tickets)}
                                  </div>
                                  {saveError && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.md }}>{saveError}</p>}
                                  <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
                                    <LoadingButton
                                      onClick={saveEdit}
                                      loading={saving}
                                      loadingText="שומר..."
                                      size="sm"
                                    >
                                      שמור
                                    </LoadingButton>
                                    <button
                                      type="button"
                                      onClick={clearLimitOverridesInEdit}
                                      style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}
                                    >
                                      אפס מכסות מותאמות
                                    </button>
                                    <button onClick={cancelEdit} style={{ background: 'none', border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: 'pointer', color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm }}>
                                      ביטול
                                    </button>
                                  </div>
                                </div>
                                )
                              })()}

                              <ClientLogoUpload
                                clientId={c.id}
                                clientName={c.name}
                                currentLogoUrl={c.logo_url}
                                secret={secret}
                                onUploaded={(url) => {
                                  setClients((prev) =>
                                    prev.map((row) => (row.id === c.id ? { ...row, logo_url: url } : row))
                                  )
                                }}
                              />

                              <div
                                style={{
                                  marginBottom: theme.spacing.xl,
                                  background: theme.colors.surface,
                                  borderRadius: theme.radius.lg,
                                  padding: theme.spacing.xl,
                                  border: `1.5px solid ${theme.colors.border}`,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: theme.spacing.sm,
                                    flexWrap: 'wrap',
                                    marginBottom: theme.spacing.md,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: theme.typography.fontWeight.semibold,
                                      fontSize: theme.typography.fontSize.sm,
                                      color: theme.colors.textPrimary,
                                    }}
                                  >
                                    הרשאות לשוניות
                                  </div>
                                  <NavFeaturesModeBadge
                                    mode={describeClientNavFeaturesMode(c.enabled_nav_features)}
                                  />
                                </div>
                                <p
                                  style={{
                                    margin: `0 0 ${theme.spacing.md}`,
                                    fontSize: theme.typography.fontSize.xs,
                                    color: theme.colors.textMuted,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  יומן, שעון עובדים ושאר תוספים בתשלום מנוהלים בלוח «תוספים בתשלום ללקוח» למטה —
                                  לא כאן. סמנו כאן רק לשוניות ליבה (תקלות, פרויקטים, דיירים וכו&apos;).
                                </p>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: theme.spacing.sm,
                                    flexWrap: 'wrap',
                                    marginBottom: theme.spacing.lg,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={applySetupPackagePreset}
                                    style={{
                                      background: theme.colors.surface,
                                      border: `1px solid ${theme.colors.border}`,
                                      borderRadius: theme.radius.md,
                                      padding: '6px 12px',
                                      cursor: 'pointer',
                                      fontSize: theme.typography.fontSize.xs,
                                      color: theme.colors.textSecondary,
                                    }}
                                  >
                                    חבילת הקמה
                                  </button>
                                  <button
                                    type="button"
                                    onClick={applyAllFeaturesPreset}
                                    style={{
                                      background: theme.colors.surface,
                                      border: `1px solid ${theme.colors.border}`,
                                      borderRadius: theme.radius.md,
                                      padding: '6px 12px',
                                      cursor: 'pointer',
                                      fontSize: theme.typography.fontSize.xs,
                                      color: theme.colors.textSecondary,
                                    }}
                                  >
                                    כל הלשוניות
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void clearFeatureRestrictions(c.id)}
                                    disabled={savingFeatures}
                                    style={{
                                      background: theme.colors.surface,
                                      border: `1px solid ${theme.colors.border}`,
                                      borderRadius: theme.radius.md,
                                      padding: '6px 12px',
                                      cursor: savingFeatures ? 'not-allowed' : 'pointer',
                                      fontSize: theme.typography.fontSize.xs,
                                      color: theme.colors.textSecondary,
                                    }}
                                  >
                                    לגסי · ללא הגבלה
                                  </button>
                                </div>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: theme.spacing.sm,
                                    marginBottom: theme.spacing.lg,
                                  }}
                                >
                                  {coreNavFeatureOptions().map(({ id, label }) => {
                                    const required = (REQUIRED_NAV_FEATURE_IDS as readonly string[]).includes(id)
                                    return (
                                      <label
                                        key={id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          fontSize: theme.typography.fontSize.xs,
                                          color: theme.colors.textPrimary,
                                          cursor: required ? 'default' : 'pointer',
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={featuresDraft.includes(id)}
                                          disabled={required}
                                          onChange={(e) => toggleFeatureDraft(id, e.target.checked)}
                                        />
                                        <span>{label}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                                {featuresError && (
                                  <p
                                    style={{
                                      color: theme.colors.error,
                                      fontSize: theme.typography.fontSize.xs,
                                      marginBottom: theme.spacing.md,
                                    }}
                                  >
                                    {featuresError}
                                  </p>
                                )}
                                <LoadingButton
                                  onClick={() => void saveFeatures(c.id)}
                                  loading={savingFeatures}
                                  loadingText="שומר..."
                                  size="sm"
                                >
                                  שמור הרשאות
                                </LoadingButton>
                              </div>

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

                              {/* Delete client */}
                              <div style={{ marginTop: theme.spacing.xl, paddingTop: theme.spacing.xl, borderTop: `1px solid ${theme.colors.border}` }}>
                                <div style={{ fontWeight: theme.typography.fontWeight.semibold, fontSize: theme.typography.fontSize.sm, color: theme.colors.error, marginBottom: theme.spacing.md }}>
                                  מחיקת לקוח
                                </div>
                                {deleteTarget?.id !== c.id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteTarget(c)
                                      setDeleteConfirmName('')
                                      setDeleteError('')
                                    }}
                                    style={{
                                      background: theme.colors.errorMuted,
                                      border: `1.5px solid ${theme.colors.error}`,
                                      borderRadius: theme.radius.md,
                                      padding: '8px 16px',
                                      cursor: 'pointer',
                                      color: theme.colors.error,
                                      fontSize: theme.typography.fontSize.sm,
                                      fontWeight: 600,
                                    }}
                                  >
                                    מחק לקוח לצמיתות
                                  </button>
                                ) : (
                                  <div style={{ maxWidth: 420 }}>
                                    <p style={{ margin: `0 0 ${theme.spacing.md}`, fontSize: theme.typography.fontSize.sm, color: theme.colors.textSecondary }}>
                                      פעולה בלתי הפיכה. הקלידי את שם הלקוח <strong>{c.name}</strong> לאישור:
                                    </p>
                                    <input
                                      value={deleteConfirmName}
                                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                                      placeholder={c.name}
                                      style={{ ...inputStyle, marginBottom: theme.spacing.md }}
                                    />
                                    {deleteError && <p style={{ color: theme.colors.error, fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.md }}>{deleteError}</p>}
                                    <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                                      <LoadingButton
                                        onClick={() => void deleteClient()}
                                        loading={deleting}
                                        loadingText="מוחק..."
                                        size="sm"
                                        style={{ background: theme.colors.error, borderColor: theme.colors.error }}
                                      >
                                        אישור מחיקה
                                      </LoadingButton>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDeleteTarget(null)
                                          setDeleteConfirmName('')
                                          setDeleteError('')
                                        }}
                                        style={{ background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '8px 16px', cursor: 'pointer', fontSize: theme.typography.fontSize.sm }}
                                      >
                                        ביטול
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
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
          </>
        )}
      </div>
    </div>
  )
}
