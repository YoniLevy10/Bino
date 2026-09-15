'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import {
  clearAdminSecret,
  isAdminSecretPersisted,
  readAdminSecret,
  writeAdminSecret,
} from '@/lib/admin-secret-session'
import { PLAN_SETUP_OPTIONS } from '@/lib/plan-display'
import { DEFAULT_SIDEBAR_NAV_ORDER, type SidebarNavItemId } from '@/lib/sidebar-nav'
import {
  parseEnabledNavFeaturesFromDb,
  SETUP_PACKAGE_NAV_FEATURE_IDS,
} from '@/lib/client-nav-features'
import { SuperadminOpsPanel } from '@/app/components/superadmin/SuperadminOpsPanel'
import { MetaWhatsAppPendingPanel } from '@/app/components/settings/MetaWhatsAppPendingPanel'
import { UsageAnalyticsPanel } from './UsageAnalyticsPanel'
import { BottomNav } from './components/BottomNav'
import { ClientsList } from './components/ClientsList'
import { ClientHub } from './components/ClientHub'
import { ClientTaskView } from './components/ClientTaskView'
import { SettingsView } from './components/SettingsView'
import { SalesLeadsPanel } from './components/SalesLeadsPanel'
import { clientHash, parseSuperadminHash, tabHash, writeHash } from './hashRoute'
import {
  adminHeaders,
  editStateFromClient,
  emptyEditState,
  parseOptionalLimitInput,
  type NewClientForm,
} from './helpers'
import type {
  ClientFilter,
  ClientRow,
  ClientTask,
  EditState,
  PlanCatalogRow,
  TabMode,
} from './types'

const EMPTY_NEW: NewClientForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  plan_tier: 'starter',
  max_workers: '',
  buildings_allowed: '',
  max_tickets_per_month: '',
}

function featuresForUi(raw: SidebarNavItemId[] | null): SidebarNavItemId[] {
  return raw?.length ? [...raw] : [...DEFAULT_SIDEBAR_NAV_ORDER]
}

export default function SuperAdminPage() {
  const [secret, setSecret] = useState('')
  const [inputSecret, setInputSecret] = useState('')
  const [rememberSecret, setRememberSecret] = useState(true)
  const [unlocked, setUnlocked] = useState(false)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [catalog, setCatalog] = useState<PlanCatalogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editState, setEditState] = useState<EditState>(emptyEditState())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [featuresDraft, setFeaturesDraft] = useState<SidebarNavItemId[]>([...DEFAULT_SIDEBAR_NAV_ORDER])
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [featuresError, setFeaturesError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newClient, setNewClient] = useState<NewClientForm>(EMPTY_NEW)
  const [creating, setCreating] = useState(false)
  const [magicLinks, setMagicLinks] = useState<Record<string, string>>({})
  const [magicLoadingId, setMagicLoadingId] = useState<string | null>(null)
  const [opsUnresolved, setOpsUnresolved] = useState(0)
  const [tab, setTab] = useState<TabMode>('clients')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientTask, setClientTask] = useState<ClientTask>('hub')

  const applyRoute = useCallback(() => {
    const route = parseSuperadminHash(typeof window !== 'undefined' ? window.location.hash : '')
    if (route.kind === 'tab') {
      setTab(route.tab)
      setSelectedClientId(null)
      setClientTask('hub')
      return
    }
    setTab('clients')
    setSelectedClientId(route.clientId)
    setClientTask(route.task)
  }, [])

  useEffect(() => {
    applyRoute()
    window.addEventListener('hashchange', applyRoute)
    return () => window.removeEventListener('hashchange', applyRoute)
  }, [applyRoute])

  useEffect(() => {
    const stored = readAdminSecret()
    if (!stored) return
    setSecret(stored)
    setInputSecret(stored)
    setRememberSecret(isAdminSecretPersisted())
    setUnlocked(true)
  }, [])

  const loadClients = useCallback(async (s: string) => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, pricingRes] = await Promise.all([
        fetch('/api/superadmin/stats', { headers: adminHeaders(s) }),
        fetch('/api/superadmin/plans/pricing', { headers: adminHeaders(s) }),
      ])
      const statsJson = (await statsRes.json()) as { error?: string; clients?: ClientRow[] }
      const pricingJson = (await pricingRes.json()) as { catalog?: PlanCatalogRow[]; error?: string }
      if (!statsRes.ok) throw new Error(statsJson.error || 'שגיאה בטעינה')
      setClients(statsJson.clients || [])
      if (pricingRes.ok) setCatalog(pricingJson.catalog || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
      setUnlocked(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked && secret) void loadClients(secret)
  }, [unlocked, secret, loadClients])

  const selectedClient = useMemo(
    () => (selectedClientId ? clients.find((c) => c.id === selectedClientId) ?? null : null),
    [clients, selectedClientId],
  )

  useEffect(() => {
    if (!selectedClient) return
    setEditState(editStateFromClient(selectedClient))
    setFeaturesDraft(featuresForUi(selectedClient.enabled_nav_features))
    setDeleteConfirmName('')
    setSaveError('')
    setFeaturesError('')
    setDeleteError('')
  }, [selectedClient?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (q) {
        const hay = [c.name, c.admin_email ?? '', c.id, c.manager_phone ?? '', c.whatsapp_phone_number_id ?? '']
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter === 'open_tickets' && c.open_tickets_count <= 0) return false
      if (filter === 'no_whatsapp' && c.whatsapp_phone_number_id) return false
      if (filter === 'at_worker_limit') {
        if (c.max_workers == null || c.workers_active_count < c.max_workers) return false
      }
      return true
    })
  }, [clients, search, filter])

  const totalOpenTickets = useMemo(
    () => clients.reduce((sum, c) => sum + c.open_tickets_count, 0),
    [clients],
  )

  function unlock(e: FormEvent) {
    e.preventDefault()
    if (!inputSecret.trim()) return
    const next = inputSecret.trim()
    writeAdminSecret(next, { persist: rememberSecret })
    setSecret(next)
    setUnlocked(true)
  }

  function logout() {
    clearAdminSecret()
    setSecret('')
    setInputSecret('')
    setUnlocked(false)
    setClients([])
    setSelectedClientId(null)
    writeHash('')
  }

  function goTab(next: TabMode) {
    setTab(next)
    setSelectedClientId(null)
    setClientTask('hub')
    writeHash(tabHash(next))
  }

  function openClient(id: string, task: ClientTask = 'hub') {
    setTab('clients')
    setSelectedClientId(id)
    setClientTask(task)
    writeHash(clientHash(id, task))
  }

  function backToList() {
    setSelectedClientId(null)
    setClientTask('hub')
    writeHash(tabHash('clients'))
  }

  function backToHub() {
    if (!selectedClientId) return
    setClientTask('hub')
    writeHash(clientHash(selectedClientId, 'hub'))
  }

  function onPlanTierChange(tier: string) {
    setEditState((s) => ({
      ...s,
      plan_tier: tier,
      max_workers: '',
      buildings_allowed: '',
      max_tickets_per_month: '',
    }))
  }

  function onClearOverrides() {
    setEditState((s) => ({
      ...s,
      max_workers: '',
      buildings_allowed: '',
      max_tickets_per_month: '',
    }))
  }

  async function savePlan() {
    if (!selectedClient) return
    setSaving(true)
    setSaveError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/superadmin/client/${selectedClient.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
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
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה בשמירה')
      setSuccess('נשמר')
      await loadClients(secret)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  async function saveFeatures() {
    if (!selectedClient) return
    setSavingFeatures(true)
    setFeaturesError('')
    try {
      const res = await fetch(`/api/superadmin/client/${selectedClient.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_nav_features: featuresDraft }),
      })
      const json = (await res.json()) as { client?: ClientRow; error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה בשמירה')
      if (json.client) {
        const parsed = parseEnabledNavFeaturesFromDb(json.client.enabled_nav_features)
        setClients((prev) =>
          prev.map((c) => (c.id === selectedClient.id ? { ...c, enabled_nav_features: parsed } : c)),
        )
        setFeaturesDraft(featuresForUi(parsed))
      }
      setSuccess('הרשאות נשמרו')
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function clearFeatures() {
    if (!selectedClient) return
    setSavingFeatures(true)
    setFeaturesError('')
    try {
      const res = await fetch(`/api/superadmin/client/${selectedClient.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_nav_features: null }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה')
      setClients((prev) =>
        prev.map((c) => (c.id === selectedClient.id ? { ...c, enabled_nav_features: null } : c)),
      )
      setFeaturesDraft([...DEFAULT_SIDEBAR_NAV_ORDER])
      setSuccess('הוחזר למצב לגסי')
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function deleteClient() {
    if (!selectedClient) return
    if (deleteConfirmName.trim() !== selectedClient.name.trim()) {
      setDeleteError('יש להקליד את שם הלקוח בדיוק')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/superadmin/client/${selectedClient.id}`, {
        method: 'DELETE',
        headers: adminHeaders(secret),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה במחיקה')
      setSuccess('הלקוח נמחק')
      backToList()
      await loadClients(secret)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setDeleting(false)
    }
  }

  async function createClient(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const body: Record<string, unknown> = {
        name: newClient.name.trim(),
        email: newClient.email.trim(),
        password: newClient.password,
        phone: newClient.phone.trim() || undefined,
        plan_tier: newClient.plan_tier,
      }
      if (newClient.max_workers.trim()) body.max_workers = Number(newClient.max_workers)
      if (newClient.buildings_allowed.trim()) body.buildings_allowed = Number(newClient.buildings_allowed)
      if (newClient.max_tickets_per_month.trim()) body.max_tickets_per_month = Number(newClient.max_tickets_per_month)
      const res = await fetch('/api/superadmin/clients', {
        method: 'POST',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה ביצירה')
      setSuccess('לקוח נוצר')
      setNewClient(EMPTY_NEW)
      setShowNewForm(false)
      await loadClients(secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setCreating(false)
    }
  }

  async function createMagicLink(clientId: string, email: string) {
    setMagicLoadingId(clientId)
    setError('')
    try {
      // Clear tenant UI caches before issuing a magic link so opening it
      // cannot briefly paint the previous client's dashboard/branding.
      const { clearAllTenantUiCaches } = await import('@/lib/tenant-browser-cache')
      clearAllTenantUiCaches()
      const res = await fetch('/api/superadmin/magic-link', {
        method: 'POST',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = (await res.json()) as { error?: string; link?: string }
      if (!res.ok || !json.link) throw new Error(json.error || 'שגיאה')
      setMagicLinks((prev) => ({ ...prev, [clientId]: json.link! }))
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json.link)
        setSuccess('קישור הועתק')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setMagicLoadingId(null)
    }
  }

  const hideBottomNav = Boolean(selectedClientId && clientTask !== 'hub')

  if (!unlocked) {
    return (
      <div className="sa-lock" dir="rtl">
        <form className="sa-lock-card" onSubmit={unlock}>
          <h1>Super Admin</h1>
          <p>הזן סיסמת מנהל מערכת</p>
          <input
            type="password"
            value={inputSecret}
            onChange={(e) => setInputSecret(e.target.value)}
            placeholder="סיסמה"
            autoFocus
          />
          <label className="sa-check">
            <input
              type="checkbox"
              checked={rememberSecret}
              onChange={(e) => setRememberSecret(e.target.checked)}
            />
            זכור במכשיר זה
          </label>
          <LoadingButton type="submit" loading={false} className="sa-btn sa-btn-primary">
            כניסה
          </LoadingButton>
          <div className="sa-lock-setup">
            <a href="/superadmin/setup">הקמת לקוח חדש</a>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="sa-page" dir="rtl">
      <header className="sa-topbar">
        <div>
          <h1 className="sa-header-title">Super Admin</h1>
          <p className="sa-muted">ניהול לקוחות · לידים · תפעול · שימוש</p>
        </div>
        <div className="sa-topbar-actions sa-header-actions">
          <LoadingButton
            type="button"
            loading={loading}
            className="sa-btn sa-btn-ghost sa-touch-btn"
            onClick={() => void loadClients(secret)}
          >
            רענון
          </LoadingButton>
          <button type="button" className="sa-btn sa-btn-ghost sa-touch-btn" onClick={logout}>
            יציאה
          </button>
        </div>
      </header>

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}
      {success ? <div className="sa-banner sa-banner-ok">{success}</div> : null}

      <main className={`sa-main${hideBottomNav ? '' : ' sa-page-with-nav'}`}>
        {tab === 'clients' && !selectedClientId ? (
          <>
            <ClientsList
              clients={clients}
              filtered={filtered}
              catalog={catalog}
              loading={loading}
              search={search}
              filter={filter}
              totalOpenTickets={totalOpenTickets}
              opsBadge={opsUnresolved}
              onSearch={setSearch}
              onFilter={setFilter}
              onOpenClient={(id) => openClient(id)}
            />
            <div className="sa-desktop-only" style={{ marginTop: 16 }}>
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowNewForm((v) => !v)}>
                {showNewForm ? 'סגור טופס' : '+ לקוח חדש'}
              </button>
              {showNewForm ? (
                <form className="sa-panel" onSubmit={createClient} style={{ marginTop: 12 }}>
                  <h3>הקמת לקוח</h3>
                  <div className="sa-form-stack">
                    <label>
                      שם
                      <input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
                    </label>
                    <label>
                      אימייל אדמין
                      <input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} required />
                    </label>
                    <label>
                      סיסמה
                      <input type="password" value={newClient.password} onChange={(e) => setNewClient({ ...newClient, password: e.target.value })} required />
                    </label>
                    <label>
                      טלפון
                      <input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                    </label>
                    <label>
                      תוכנית
                      <select value={newClient.plan_tier} onChange={(e) => setNewClient({ ...newClient, plan_tier: e.target.value })}>
                        {PLAN_SETUP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <LoadingButton type="submit" loading={creating} className="sa-btn sa-btn-primary" style={{ marginTop: 12 }}>
                    צור לקוח
                  </LoadingButton>
                </form>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === 'clients' && selectedClient && clientTask === 'hub' ? (
          <ClientHub
            client={selectedClient}
            catalog={catalog}
            magicLink={magicLinks[selectedClient.id]}
            magicLoading={magicLoadingId === selectedClient.id}
            onBack={backToList}
            onOpenTask={(task) => openClient(selectedClient.id, task)}
            onMagicLink={() => {
              if (selectedClient.admin_email) void createMagicLink(selectedClient.id, selectedClient.admin_email)
            }}
          />
        ) : null}

        {tab === 'clients' && selectedClient && clientTask !== 'hub' ? (
          <ClientTaskView
            task={clientTask}
            client={selectedClient}
            secret={secret}
            catalog={catalog}
            editState={editState}
            setEditState={setEditState}
            onPlanTierChange={onPlanTierChange}
            onClearOverrides={onClearOverrides}
            saving={saving}
            saveError={saveError}
            onSavePlan={() => void savePlan()}
            featuresDraft={featuresDraft}
            setFeaturesDraft={setFeaturesDraft}
            savingFeatures={savingFeatures}
            featuresError={featuresError}
            onSaveFeatures={() => void saveFeatures()}
            onClearFeatures={() => void clearFeatures()}
            onApplySetupPreset={() => setFeaturesDraft([...SETUP_PACKAGE_NAV_FEATURE_IDS])}
            onApplyAllFeatures={() => setFeaturesDraft([...DEFAULT_SIDEBAR_NAV_ORDER])}
            deleteConfirmName={deleteConfirmName}
            setDeleteConfirmName={setDeleteConfirmName}
            deleting={deleting}
            deleteError={deleteError}
            onDelete={() => void deleteClient()}
            onUploadedLogo={(url) => {
              setClients((prev) => prev.map((c) => (c.id === selectedClient.id ? { ...c, logo_url: url } : c)))
            }}
            onBack={backToHub}
          />
        ) : null}

        {tab === 'leads' ? <SalesLeadsPanel secret={secret} /> : null}

        {tab === 'ops' ? (
          <div className="sa-tab-panel">
            <SuperadminOpsPanel
              adminSecret={secret}
              onCountsChange={(c) => setOpsUnresolved(c.unresolved_errors)}
            />
            <details className="sa-meta-details sa-collapsible">
              <summary>מדריך Meta WhatsApp</summary>
              <div className="sa-collapsible-body">
                <MetaWhatsAppPendingPanel />
              </div>
            </details>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div className="sa-tab-panel">
            <UsageAnalyticsPanel secret={secret} />
          </div>
        ) : null}

        {tab === 'settings' ? <SettingsView secret={secret} /> : null}
      </main>

      <BottomNav tab={tab} opsBadge={opsUnresolved} onChange={goTab} hidden={hideBottomNav} />

      <style jsx global>{`
        .sa-meta-details {
          margin-top: 16px;
          border: 1px solid ${theme.colors.border};
          border-radius: 12px;
          padding: 8px 12px;
          background: ${theme.colors.surface};
        }
        .sa-meta-details summary {
          cursor: pointer;
          font-weight: 600;
          color: ${theme.colors.textPrimary};
        }
        .sa-lock-setup {
          margin-top: 16px;
          text-align: center;
        }
        .sa-lock-setup a {
          color: ${theme.colors.primary};
        }
      `}</style>
    </div>
  )
}
