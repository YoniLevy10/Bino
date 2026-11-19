'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { supabase } from '@/lib/supabase'
import { purgeLegacyAdminSecret } from '@/lib/superadmin/admin-secret-session'
import { SuperadminMfaGate } from './components/SuperadminMfaGate'
import { DEFAULT_SIDEBAR_NAV_ORDER, type SidebarNavItemId } from '@/lib/sidebar-nav'
import {
  parseEnabledNavFeaturesFromDb,
  SETUP_PACKAGE_NAV_FEATURE_IDS,
} from '@/lib/client/client-nav-features'
import { SuperadminOpsPanel } from '@/app/components/superadmin/SuperadminOpsPanel'
import { MetaWhatsAppPendingPanel } from '@/app/components/settings/MetaWhatsAppPendingPanel'
import { UsageAnalyticsPanel } from './UsageAnalyticsPanel'
import { OpsIntelligencePanel } from './OpsIntelligencePanel'
import { BottomNav } from './components/BottomNav'
import { DesktopTabBar } from './components/DesktopTabBar'
import { ClientsList } from './components/ClientsList'
import { ClientHub } from './components/ClientHub'
import { ClientTaskView } from './components/ClientTaskView'
import { ClientLaunchWizard } from './components/ClientLaunchWizard'
import { SettingsView } from './components/SettingsView'
import { SalesLeadsPanel } from './components/SalesLeadsPanel'
import { SandboxLabPanel } from './SandboxLabPanel'
import {
  clientHash,
  launchNewHash,
  onboardingHash,
  parseSuperadminHash,
  tabHash,
  writeHash,
} from './hashRoute'
import type { LaunchWizardStepId } from './launchSteps'
import {
  adminHeaders,
  editStateFromClient,
  emptyEditState,
  parseOptionalLimitInput,
} from './helpers'
import type {
  ClientFilter,
  ClientRow,
  ClientTask,
  EditState,
  PlanCatalogRow,
  TabMode,
} from './types'

function featuresForUi(raw: SidebarNavItemId[] | null): SidebarNavItemId[] {
  return raw?.length ? [...raw] : [...DEFAULT_SIDEBAR_NAV_ORDER]
}

function SuperAdminPanel({ email }: { email: string | null }) {
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
  const [magicLinks, setMagicLinks] = useState<Record<string, string>>({})
  const [magicLoadingId, setMagicLoadingId] = useState<string | null>(null)
  const [opsUnresolved, setOpsUnresolved] = useState(0)
  const [tab, setTab] = useState<TabMode>('clients')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientTask, setClientTask] = useState<ClientTask>('hub')
  const [launchMode, setLaunchMode] = useState<'off' | 'new' | 'existing'>('off')
  const [launchStep, setLaunchStep] = useState<LaunchWizardStepId>(1)

  const applyRoute = useCallback(() => {
    const route = parseSuperadminHash(typeof window !== 'undefined' ? window.location.hash : '')
    if (route.kind === 'tab') {
      setTab(route.tab)
      setSelectedClientId(null)
      setClientTask('hub')
      setLaunchMode('off')
      return
    }
    if (route.kind === 'launch_new') {
      setTab('clients')
      setSelectedClientId(null)
      setClientTask('hub')
      setLaunchMode('new')
      setLaunchStep(route.step)
      return
    }
    setTab('clients')
    setSelectedClientId(route.clientId)
    setClientTask(route.task)
    if (route.task === 'onboarding') {
      setLaunchMode('existing')
      setLaunchStep(route.launchStep ?? 2)
    } else {
      setLaunchMode('off')
    }
  }, [])

  useEffect(() => {
    applyRoute()
    window.addEventListener('hashchange', applyRoute)
    return () => window.removeEventListener('hashchange', applyRoute)
  }, [applyRoute])

  const loadClients = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, pricingRes] = await Promise.all([
        fetch('/api/superadmin/stats', { credentials: 'same-origin' }),
        fetch('/api/superadmin/plans/pricing', { credentials: 'same-origin' }),
      ])
      const statsJson = (await statsRes.json()) as { error?: string; clients?: ClientRow[] }
      const pricingJson = (await pricingRes.json()) as { catalog?: PlanCatalogRow[]; error?: string }
      if (!statsRes.ok) throw new Error(statsJson.error || 'שגיאה בטעינה')
      setClients(statsJson.clients || [])
      if (pricingRes.ok) setCatalog(pricingJson.catalog || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

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

  async function logout() {
    purgeLegacyAdminSecret()
    setClients([])
    setSelectedClientId(null)
    writeHash('')
    await supabase.auth.signOut()
    window.location.href = '/superadmin'
  }

  function goTab(next: TabMode) {
    setTab(next)
    setSelectedClientId(null)
    setClientTask('hub')
    setLaunchMode('off')
    writeHash(tabHash(next))
  }

  function openClient(id: string, task: ClientTask = 'hub') {
    setTab('clients')
    setSelectedClientId(id)
    setClientTask(task)
    if (task === 'onboarding') {
      setLaunchMode('existing')
      setLaunchStep(2)
      writeHash(onboardingHash(id, 2))
      return
    }
    setLaunchMode('off')
    writeHash(clientHash(id, task))
  }

  function startNewLaunch() {
    setTab('clients')
    setSelectedClientId(null)
    setClientTask('hub')
    setLaunchMode('new')
    setLaunchStep(1)
    writeHash(launchNewHash(1))
  }

  function backToList() {
    setSelectedClientId(null)
    setClientTask('hub')
    setLaunchMode('off')
    writeHash(tabHash('clients'))
  }

  function backToHub() {
    if (!selectedClientId) return
    setClientTask('hub')
    setLaunchMode('off')
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
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
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
      await loadClients()
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
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
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
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
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
        headers: adminHeaders(),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שגיאה במחיקה')
      setSuccess('הלקוח נמחק')
      backToList()
      await loadClients()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setDeleting(false)
    }
  }

  async function createMagicLink(clientId: string, email: string) {
    setMagicLoadingId(clientId)
    setError('')
    try {
      const { clearAllTenantUiCaches } = await import('@/lib/tenant/tenant-browser-cache')
      clearAllTenantUiCaches()
      const res = await fetch('/api/superadmin/magic-link', {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
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

  const hideBottomNav =
    launchMode !== 'off' || Boolean(selectedClientId && clientTask !== 'hub')

  return (
    <div className="sa-page" dir="rtl">
      <header className="sa-topbar">
        <div className="sa-brand">
          <span className="sa-brand-mark" aria-hidden>
            B
          </span>
          <div>
            <h1 className="sa-header-title">Super Admin</h1>
            <p className="sa-muted">
              {email ? `${email} · ` : ''}לקוחות, לידים, שימוש, תובנות ותפעול
            </p>
          </div>
        </div>
        <div className="sa-topbar-actions sa-header-actions">
          <LoadingButton
            type="button"
            loading={loading}
            className="sa-btn sa-btn-ghost sa-touch-btn"
            onClick={() => void loadClients()}
          >
            רענון
          </LoadingButton>
          <button type="button" className="sa-btn sa-btn-ghost sa-touch-btn" onClick={logout}>
            יציאה
          </button>
        </div>
      </header>

      <DesktopTabBar tab={tab} opsBadge={opsUnresolved} onChange={goTab} hidden={hideBottomNav} />

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}
      {success ? <div className="sa-banner sa-banner-ok">{success}</div> : null}

      <main className={`sa-main${hideBottomNav ? '' : ' sa-page-with-nav'}`}>
        {tab === 'clients' && launchMode !== 'off' ? (
          <ClientLaunchWizard
            mode={launchMode === 'new' ? 'new' : 'existing'}
            clientId={selectedClientId}
            clientName={selectedClient?.name}
            step={launchStep}
            onCreated={(id) => {
              setSelectedClientId(id)
              setLaunchMode('existing')
              void loadClients()
            }}
            onExit={() => {
              if (selectedClientId) backToHub()
              else backToList()
            }}
            onOpenTask={(task) => {
              if (selectedClientId) openClient(selectedClientId, task)
            }}
            onClientsChanged={() => void loadClients()}
          />
        ) : null}

        {tab === 'clients' && launchMode === 'off' && !selectedClientId ? (
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
            onNewClient={startNewLaunch}
          />
        ) : null}

        {tab === 'clients' && launchMode === 'off' && selectedClient && clientTask === 'hub' ? (
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

        {tab === 'clients' &&
        launchMode === 'off' &&
        selectedClient &&
        clientTask !== 'hub' &&
        clientTask !== 'onboarding' ? (
          <ClientTaskView
            task={clientTask}
            client={selectedClient}
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
              setClients((prev) =>
                prev.map((c) => (c.id === selectedClient.id ? { ...c, logo_url: url } : c)),
              )
            }}
            onBack={backToHub}
            onOpenTask={(task) => openClient(selectedClient.id, task)}
          />
        ) : null}

        {tab === 'sandbox' ? (
          <div className="sa-tab-panel">
            <SandboxLabPanel />
          </div>
        ) : null}

        {tab === 'leads' ? <SalesLeadsPanel /> : null}

        {tab === 'ops' ? (
          <div className="sa-tab-panel">
            <SuperadminOpsPanel onCountsChange={(c) => setOpsUnresolved(c.unresolved_errors)} />
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
            <UsageAnalyticsPanel />
          </div>
        ) : null}

        {tab === 'intelligence' ? (
          <div className="sa-tab-panel">
            <OpsIntelligencePanel />
          </div>
        ) : null}

        {tab === 'settings' ? <SettingsView onStartLaunch={startNewLaunch} /> : null}
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

export default function SuperAdminPage() {
  return (
    <SuperadminMfaGate>
      {({ email }) => <SuperAdminPanel email={email} />}
    </SuperadminMfaGate>
  )
}
