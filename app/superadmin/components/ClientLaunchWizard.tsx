'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadingButton } from '@/app/components/LoadingButton'
import { PLAN_SETUP_OPTIONS } from '@/lib/plans/plan-display'
import {
  buildResidentsImportPayload,
  parseResidentsWorkbook,
} from '@/lib/residents/import-residents-excel'
import { parseBuildingsWorkbook, buildingsTemplateRows } from '@/lib/residents/import-buildings-excel'
import { createWorkbook, downloadExcelWorkbook } from '@/lib/excel/excel-workbook'
import { ClientLogoUpload } from '../ClientLogoUpload'
import { ClientLaunchChecklistPanel } from '../ClientLaunchChecklistPanel'
import { LAUNCH_WIZARD_STEPS, type LaunchWizardStepId } from '../launchSteps'
import { onboardingHash, writeHash } from '../hashRoute'
import type { ClientTask } from '../types'

type BuildingDraft = { name: string; project_code: string; address: string }
type WorkerDraft = { full_name: string; phone: string; role: string }

type IntegrationSnapshot = {
  whatsapp_phone_number_id?: string | null
  whatsapp_business_phone?: string | null
  whatsapp_access_token_set?: boolean
  manager_phone?: string | null
  sms_sender_name?: string | null
  sms_on_ticket_open?: boolean
  sms_on_ticket_close?: boolean
  grow_enabled?: boolean
  grow_user_id?: string | null
  grow_legal_business_name?: string | null
  grow_legal_phone?: string | null
  grow_legal_address?: string | null
  grow_legal_email?: string | null
  financy_enabled?: boolean
  financy_client_id?: string | null
  financy_user_id?: string | null
  financy_client_secret_set?: boolean
  palgate_enabled?: boolean
  palgate_device_id?: string | null
  palgate_phone_number?: string | null
  palgate_token_type?: string | null
  palgate_base_url?: string | null
  palgate_session_token_set?: boolean
  email_slug?: string | null
}

export function ClientLaunchWizard({
  mode,
  clientId,
  clientName,
  step,
  onCreated,
  onExit,
  onOpenTask,
  onClientsChanged,
}: {
  mode: 'new' | 'existing'
  clientId: string | null
  clientName?: string
  step: LaunchWizardStepId
  onCreated: (id: string) => void
  onExit: () => void
  onOpenTask?: (task: ClientTask) => void
  onClientsChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // Step 1
  const [companyName, setCompanyName] = useState('')
  const [planTier, setPlanTier] = useState('starter')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPhone, setAdminPhone] = useState('')

  // Step 2
  const [buildings, setBuildings] = useState<BuildingDraft[]>([
    { name: '', project_code: '', address: '' },
  ])
  const [existingProjects, setExistingProjects] = useState<
    { id: string; name: string; project_code: string }[]
  >([])

  // Step 3
  const [residentMsg, setResidentMsg] = useState('')

  // Step 4
  const [workers, setWorkers] = useState<WorkerDraft[]>([{ full_name: '', phone: '', role: '' }])
  const [existingWorkers, setExistingWorkers] = useState<
    { id: string; full_name: string; phone: string }[]
  >([])

  // Steps 5–8 forms
  const [snap, setSnap] = useState<IntegrationSnapshot>({})
  const [waId, setWaId] = useState('')
  const [waPhone, setWaPhone] = useState('')
  const [waToken, setWaToken] = useState('')
  const [smsSender, setSmsSender] = useState('')
  const [mgrPhone, setMgrPhone] = useState('')
  const [smsOpen, setSmsOpen] = useState(true)
  const [smsClose, setSmsClose] = useState(true)

  const [growEnabled, setGrowEnabled] = useState(false)
  const [growUserId, setGrowUserId] = useState('')
  const [growLegalName, setGrowLegalName] = useState('')
  const [growLegalPhone, setGrowLegalPhone] = useState('')
  const [growLegalAddress, setGrowLegalAddress] = useState('')
  const [growLegalEmail, setGrowLegalEmail] = useState('')
  const [collectionsOn, setCollectionsOn] = useState(false)

  const [financyEnabled, setFinancyEnabled] = useState(false)
  const [financyClientId, setFinancyClientId] = useState('')
  const [financySecret, setFinancySecret] = useState('')
  const [financyUserId, setFinancyUserId] = useState('')

  const [palgateEnabled, setPalgateEnabled] = useState(false)
  const [palgateDevice, setPalgateDevice] = useState('')
  const [palgatePhone, setPalgatePhone] = useState('')
  const [palgateToken, setPalgateToken] = useState('')
  const [palgateTokenType, setPalgateTokenType] = useState('sms')
  const [palgateBase, setPalgateBase] = useState('')

  const [emailSlug, setEmailSlug] = useState('')

  const activeClientId = clientId
  const stepMeta = LAUNCH_WIZARD_STEPS.find((s) => s.id === step) ?? LAUNCH_WIZARD_STEPS[0]

  const goStep = useCallback(
    (next: LaunchWizardStepId) => {
      if (!activeClientId) {
        writeHash(next <= 1 ? '#launch/new' : `#launch/${next}`)
        return
      }
      writeHash(onboardingHash(activeClientId, next))
    },
    [activeClientId]
  )

  const loadIntegration = useCallback(async (id: string) => {
    const res = await fetch(`/api/superadmin/client/${id}`, { credentials: 'same-origin' })
    const json = (await res.json()) as { client?: IntegrationSnapshot; error?: string }
    if (!res.ok || !json.client) return
    const c = json.client
    setSnap(c)
    setWaId(c.whatsapp_phone_number_id || '')
    setWaPhone(c.whatsapp_business_phone || '')
    setSmsSender(c.sms_sender_name || '')
    setMgrPhone(c.manager_phone || '')
    setSmsOpen(c.sms_on_ticket_open !== false)
    setSmsClose(c.sms_on_ticket_close !== false)
    setGrowEnabled(c.grow_enabled === true)
    setGrowUserId(c.grow_user_id || '')
    setGrowLegalName(c.grow_legal_business_name || '')
    setGrowLegalPhone(c.grow_legal_phone || '')
    setGrowLegalAddress(c.grow_legal_address || '')
    setGrowLegalEmail(c.grow_legal_email || '')
    setFinancyEnabled(c.financy_enabled === true)
    setFinancyClientId(c.financy_client_id || '')
    setFinancyUserId(c.financy_user_id || '')
    setPalgateEnabled(c.palgate_enabled === true)
    setPalgateDevice(c.palgate_device_id || '')
    setPalgatePhone(c.palgate_phone_number || '')
    setPalgateTokenType(c.palgate_token_type || 'sms')
    setPalgateBase(c.palgate_base_url || '')
  }, [])

  const loadProjects = useCallback(async (id: string) => {
    const res = await fetch(`/api/superadmin/client/${id}/projects`, { credentials: 'same-origin' })
    const json = (await res.json()) as {
      projects?: { id: string; name: string; project_code: string }[]
    }
    if (res.ok) setExistingProjects(json.projects || [])
  }, [])

  const loadWorkers = useCallback(async (id: string) => {
    const res = await fetch(`/api/superadmin/client/${id}/workers`, { credentials: 'same-origin' })
    const json = (await res.json()) as {
      workers?: { id: string; full_name: string; phone: string }[]
    }
    if (res.ok) setExistingWorkers(json.workers || [])
  }, [])

  const loadSlug = useCallback(async (id: string) => {
    const res = await fetch(`/api/superadmin/client/${id}/launch-status`, {
      credentials: 'same-origin',
    })
    const json = (await res.json()) as { email_slug?: string | null; resolved_email_slug?: string }
    if (res.ok) setEmailSlug(json.email_slug || json.resolved_email_slug || '')
  }, [])

  const loadAddons = useCallback(async (id: string) => {
    const res = await fetch(`/api/superadmin/client/${id}/addons`, { credentials: 'same-origin' })
    const json = (await res.json()) as { addons?: { addon_key: string; enabled: boolean }[] }
    if (res.ok) {
      setCollectionsOn(
        (json.addons || []).some((a) => a.addon_key === 'collections' && a.enabled)
      )
    }
  }, [])

  useEffect(() => {
    if (!activeClientId || step < 2) return
    void loadProjects(activeClientId)
    void loadWorkers(activeClientId)
    void loadIntegration(activeClientId)
    void loadSlug(activeClientId)
    void loadAddons(activeClientId)
  }, [activeClientId, step, loadProjects, loadWorkers, loadIntegration, loadSlug, loadAddons])

  async function patchClient(body: Record<string, unknown>) {
    if (!activeClientId) throw new Error('אין לקוח')
    const res = await fetch(`/api/superadmin/client/${activeClientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
    const json = (await res.json()) as { error?: string }
    if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'שמירה נכשלה')
  }

  async function createClient() {
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const body: Record<string, unknown> = {
        company_name: companyName.trim(),
        plan_tier: planTier,
        admin_email: adminEmail.trim(),
        admin_phone: adminPhone.trim() || undefined,
        projects: [],
        workers: [],
      }
      if (adminPassword.trim()) body.admin_password = adminPassword.trim()
      const res = await fetch('/api/admin/setup-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      })
      const json = (await res.json()) as { error?: string; client_id?: string }
      if (!res.ok || !json.client_id) {
        throw new Error(
          typeof json.error === 'string' ? json.error : JSON.stringify(json.error) || 'יצירה נכשלה'
        )
      }
      setOkMsg('לקוח נוצר — ממשיכים לבניינים')
      onCreated(json.client_id)
      onClientsChanged?.()
      writeHash(onboardingHash(json.client_id, 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function saveBuildings() {
    if (!activeClientId) return
    setBusy(true)
    setError('')
    try {
      const rows = buildings
        .map((b) => ({
          name: b.name.trim(),
          project_code: b.project_code.trim().toUpperCase(),
          address: b.address.trim() || undefined,
        }))
        .filter((b) => b.name && b.project_code)
      if (rows.length === 0 && existingProjects.length === 0) {
        throw new Error('הוסיפו לפחות בניין אחד (או דלגו אם כבר יש)')
      }
      if (rows.length > 0) {
        const res = await fetch(`/api/superadmin/client/${activeClientId}/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projects: rows }),
          credentials: 'same-origin',
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'ייבוא בניינים נכשל')
      }
      setBuildings([{ name: '', project_code: '', address: '' }])
      await loadProjects(activeClientId)
      onClientsChanged?.()
      setOkMsg('בניינים נשמרו')
      goStep(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function onBuildingsFile(file: File) {
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseBuildingsWorkbook(buf, file.name)
      if (parsed.errors.length) setError(parsed.errors.join('; '))
      if (!parsed.rows.length) throw new Error('לא נמצאו בניינים בקובץ')
      setBuildings(
        parsed.rows.map((r) => ({
          name: r.name,
          project_code: r.project_code,
          address: r.address || '',
        }))
      )
      setOkMsg(`${parsed.rows.length} בניינים נטענו מהקובץ — לחצו שמירה`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'קריאת Excel נכשלה')
    }
  }

  async function downloadBuildingsTemplate() {
    const wb = createWorkbook()
    const sheet = wb.addWorksheet('בניינים')
    sheet.addRow(['שם', 'קוד', 'כתובת'])
    for (const r of buildingsTemplateRows()) {
      sheet.addRow([r.name, r.project_code, r.address || ''])
    }
    await downloadExcelWorkbook(wb, 'תבנית-בניינים.xlsx')
  }

  async function onResidentsFile(file: File) {
    if (!activeClientId) return
    setBusy(true)
    setError('')
    setResidentMsg('')
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseResidentsWorkbook(buf, { fileName: file.name })
      const payload = buildResidentsImportPayload(parsed.rows, parsed.mapping)
      const residents = payload.map((r) => ({
        project_name: r.project_name || r.project_code || existingProjects[0]?.name || 'בניין',
        apartment_number: r.apartment_number || '',
        full_name: r.full_name,
        phone: r.phone || '',
        email: '',
        is_renter: false,
        notes: r.notes || '',
      }))
      if (!residents.length) throw new Error('לא נמצאו דיירים בקובץ')
      const res = await fetch('/api/superadmin/import-residents-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          residents,
          create_missing_projects: true,
        }),
        credentials: 'same-origin',
      })
      const json = (await res.json()) as {
        error?: string
        inserted?: number
        updated?: number
        created_projects?: string[]
      }
      if (!res.ok) throw new Error(json.error || 'ייבוא דיירים נכשל')
      const createdCount = json.created_projects?.length ?? 0
      setResidentMsg(
        `יובאו ${json.inserted ?? 0} דיירים` +
          (json.updated ? ` · עודכנו ${json.updated}` : '') +
          (createdCount ? ` · בניינים חדשים ${createdCount}` : '')
      )
      await loadProjects(activeClientId)
      onClientsChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function downloadResidentsTemplate() {
    const wb = createWorkbook()
    const sheet = wb.addWorksheet('דיירים')
    sheet.addRow(['בניין', 'דירה', 'שם', 'טלפון', 'הערות'])
    sheet.addRow(['בניין לדוגמה', '1', 'ישראל ישראלי', '0501234567', ''])
    await downloadExcelWorkbook(wb, 'תבנית-דיירים.xlsx')
  }

  async function saveWorkers() {
    if (!activeClientId) return
    setBusy(true)
    setError('')
    try {
      const rows = workers
        .map((w) => ({
          full_name: w.full_name.trim(),
          phone: w.phone.trim(),
          role: w.role.trim() || undefined,
        }))
        .filter((w) => w.full_name && w.phone)
      if (rows.length > 0) {
        const res = await fetch(`/api/superadmin/client/${activeClientId}/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workers: rows }),
          credentials: 'same-origin',
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'שמירת עובדים נכשלה')
      }
      setWorkers([{ full_name: '', phone: '', role: '' }])
      await loadWorkers(activeClientId)
      onClientsChanged?.()
      setOkMsg('עובדים נשמרו')
      goStep(5)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function saveWhatsApp() {
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        whatsapp_phone_number_id: waId.trim() || null,
        whatsapp_business_phone: waPhone.trim() || null,
        sms_sender_name: smsSender.trim() || null,
        manager_phone: mgrPhone.trim() || null,
        sms_on_ticket_open: smsOpen,
        sms_on_ticket_close: smsClose,
      }
      if (waToken.trim()) body.whatsapp_access_token = waToken.trim()
      await patchClient(body)
      setWaToken('')
      await loadIntegration(activeClientId!)
      setOkMsg('WhatsApp / SMS נשמרו')
      goStep(6)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function saveGrow() {
    setBusy(true)
    setError('')
    try {
      if (collectionsOn) {
        const res = await fetch(`/api/superadmin/client/${activeClientId}/addons`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addons: [{ addon_key: 'collections', enabled: true }] }),
          credentials: 'same-origin',
        })
        if (!res.ok) {
          const json = (await res.json()) as { error?: string }
          throw new Error(json.error || 'הפעלת תוסף גבייה נכשלה')
        }
      }
      await patchClient({
        grow_enabled: growEnabled,
        grow_user_id: growUserId.trim() || null,
        grow_legal_business_name: growLegalName.trim() || null,
        grow_legal_phone: growLegalPhone.trim() || null,
        grow_legal_address: growLegalAddress.trim() || null,
        grow_legal_email: growLegalEmail.trim() || null,
      })
      setOkMsg('Grow נשמר')
      goStep(7)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function saveFinancy() {
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        financy_enabled: financyEnabled,
        financy_client_id: financyClientId.trim() || null,
        financy_user_id: financyUserId.trim() || null,
      }
      if (financySecret.trim()) body.financy_client_secret = financySecret.trim()
      await patchClient(body)
      setFinancySecret('')
      setOkMsg('Financy נשמר')
      goStep(8)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function savePalgate() {
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        palgate_enabled: palgateEnabled,
        palgate_device_id: palgateDevice.trim() || null,
        palgate_phone_number: palgatePhone.trim() || null,
        palgate_token_type: palgateTokenType.trim() || null,
        palgate_base_url: palgateBase.trim() || null,
        ensure_parking_nav: palgateEnabled,
      }
      if (palgateToken.trim()) body.palgate_session_token_hex = palgateToken.trim()
      await patchClient(body)
      setPalgateToken('')
      setOkMsg('PalGate נשמר')
      goStep(9)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function saveBranding() {
    if (!activeClientId) return
    setBusy(true)
    setError('')
    try {
      if (emailSlug.trim()) {
        const res = await fetch(`/api/superadmin/client/${activeClientId}/launch-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_slug: emailSlug.trim().toLowerCase() }),
          credentials: 'same-origin',
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error || 'שמירת slug נכשלה')
      }
      setOkMsg('מיתוג נשמר')
      goStep(10)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'new' && step === 1
      ? 'הקמת לקוח חדש'
      : `הקמה · ${clientName || companyName || 'לקוח'}`

  return (
    <div className="sa-launch-wizard" dir="rtl">
      <header className="sa-hub-header">
        <button type="button" className="sa-back-btn" onClick={onExit}>
          → חזרה
        </button>
        <h2>{title}</h2>
      </header>

      <nav className="sa-wizard-steps" aria-label="שלבי הקמה">
        {LAUNCH_WIZARD_STEPS.map((s) => {
          const disabled = mode === 'new' && !activeClientId && s.id > 1
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              className={`sa-wizard-step${s.id === step ? ' is-active' : ''}${s.id < step ? ' is-done' : ''}`}
              onClick={() => {
                if (disabled) return
                if (!activeClientId && s.id === 1) {
                  writeHash('#launch/new')
                  return
                }
                if (activeClientId) goStep(s.id)
              }}
            >
              <span className="sa-wizard-step-num">{s.id}</span>
              <span className="sa-wizard-step-label">{s.title}</span>
            </button>
          )
        })}
      </nav>

      <p className="sa-hint">
        שלב {step}/10 — {stepMeta.title}. אפשר לדלג על שלבים אופציונליים ולחזור אליהם מההאב.
      </p>

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}
      {okMsg ? <div className="sa-banner sa-banner-ok">{okMsg}</div> : null}

      <div className="sa-wizard-body sa-panel">
        {step === 1 && (
          <div className="sa-form-stack">
            <label className="sa-field">
              <span>שם לקוח / חברה</span>
              <input
                className="sa-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </label>
            <label className="sa-field">
              <span>תוכנית</span>
              <select
                className="sa-input"
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value)}
              >
                {PLAN_SETUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sa-field">
              <span>אימייל מנהל</span>
              <input
                className="sa-input"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </label>
            <label className="sa-field">
              <span>סיסמה (אופציונלי — אחרת נשלחת הזמנה)</span>
              <input
                className="sa-input"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                minLength={8}
                placeholder="לפחות 8 תווים"
              />
            </label>
            <label className="sa-field">
              <span>טלפון מנהל</span>
              <input
                className="sa-input"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                placeholder="05…"
              />
            </label>
            <LoadingButton
              type="button"
              loading={busy}
              className="sa-btn sa-btn-primary"
              disabled={!companyName.trim() || !adminEmail.trim()}
              onClick={() => void createClient()}
            >
              צור לקוח והמשך
            </LoadingButton>
          </div>
        )}

        {step === 2 && activeClientId && (
          <div className="sa-form-stack">
            {existingProjects.length > 0 ? (
              <div className="sa-hint">
                קיימים {existingProjects.length} בניינים:{' '}
                {existingProjects.map((p) => p.name).join(', ')}
              </div>
            ) : null}
            <div className="sa-wizard-file-row">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => void downloadBuildingsTemplate()}>
                הורדת תבנית Excel
              </button>
              <label className="sa-btn sa-btn-ghost">
                העלאת Excel
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onBuildingsFile(f)
                  }}
                />
              </label>
            </div>
            {buildings.map((b, i) => (
              <div key={i} className="sa-wizard-row-grid">
                <input
                  className="sa-input"
                  placeholder="שם בניין"
                  value={b.name}
                  onChange={(e) => {
                    const next = [...buildings]
                    next[i] = { ...b, name: e.target.value }
                    setBuildings(next)
                  }}
                />
                <input
                  className="sa-input"
                  placeholder="קוד"
                  value={b.project_code}
                  onChange={(e) => {
                    const next = [...buildings]
                    next[i] = { ...b, project_code: e.target.value }
                    setBuildings(next)
                  }}
                />
                <input
                  className="sa-input"
                  placeholder="כתובת"
                  value={b.address}
                  onChange={(e) => {
                    const next = [...buildings]
                    next[i] = { ...b, address: e.target.value }
                    setBuildings(next)
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              onClick={() =>
                setBuildings((prev) => [...prev, { name: '', project_code: '', address: '' }])
              }
            >
              + שורה
            </button>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveBuildings()}
              >
                שמור והמשך
              </LoadingButton>
              {existingProjects.length > 0 ? (
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(3)}>
                  דלג
                </button>
              ) : null}
            </div>
          </div>
        )}

        {step === 3 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">
              העלו Excel עם עמודות: בניין, דירה, שם, טלפון. אם חסר בניין — ייווצר אוטומטית.
            </p>
            <div className="sa-wizard-file-row">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => void downloadResidentsTemplate()}>
                הורדת תבנית
              </button>
              <label className="sa-btn sa-btn-primary">
                העלאת Excel דיירים
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onResidentsFile(f)
                  }}
                />
              </label>
            </div>
            {residentMsg ? <p className="sa-hint">{residentMsg}</p> : null}
            <div className="sa-wizard-actions">
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => goStep(4)}>
                המשך
              </button>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(4)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 4 && activeClientId && (
          <div className="sa-form-stack">
            {existingWorkers.length > 0 ? (
              <div className="sa-hint">
                קיימים {existingWorkers.length} עובדים:{' '}
                {existingWorkers.map((w) => w.full_name).join(', ')}
              </div>
            ) : null}
            {workers.map((w, i) => (
              <div key={i} className="sa-wizard-row-grid">
                <input
                  className="sa-input"
                  placeholder="שם מלא"
                  value={w.full_name}
                  onChange={(e) => {
                    const next = [...workers]
                    next[i] = { ...w, full_name: e.target.value }
                    setWorkers(next)
                  }}
                />
                <input
                  className="sa-input"
                  placeholder="טלפון"
                  value={w.phone}
                  onChange={(e) => {
                    const next = [...workers]
                    next[i] = { ...w, phone: e.target.value }
                    setWorkers(next)
                  }}
                />
                <input
                  className="sa-input"
                  placeholder="תפקיד"
                  value={w.role}
                  onChange={(e) => {
                    const next = [...workers]
                    next[i] = { ...w, role: e.target.value }
                    setWorkers(next)
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              onClick={() =>
                setWorkers((prev) => [...prev, { full_name: '', phone: '', role: '' }])
              }
            >
              + עובד
            </button>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveWorkers()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(5)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 5 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">
              חיצוני: קנו מספר ב־019 וחברו ב־Meta. כאן מדביקים את התוצאות — כולל Access Token.
            </p>
            <label className="sa-field">
              <span>מספר שולח 019 (972…)</span>
              <input className="sa-input" value={smsSender} onChange={(e) => setSmsSender(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>WA Phone Number ID</span>
              <input className="sa-input" value={waId} onChange={(e) => setWaId(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>
                WA Access Token
                {snap.whatsapp_access_token_set ? ' (שמור — הדביקו חדש להחלפה)' : ''}
              </span>
              <input
                className="sa-input"
                type="password"
                value={waToken}
                onChange={(e) => setWaToken(e.target.value)}
                dir="ltr"
                placeholder={snap.whatsapp_access_token_set ? '••••••••' : ''}
              />
            </label>
            <label className="sa-field">
              <span>מספר WhatsApp לדיירים (ל־QR)</span>
              <input className="sa-input" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>טלפון מנהל</span>
              <input className="sa-input" value={mgrPhone} onChange={(e) => setMgrPhone(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-check">
              <input type="checkbox" checked={smsOpen} onChange={(e) => setSmsOpen(e.target.checked)} />
              SMS בפתיחת תקלה
            </label>
            <label className="sa-check">
              <input type="checkbox" checked={smsClose} onChange={(e) => setSmsClose(e.target.checked)} />
              SMS בסגירת תקלה
            </label>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveWhatsApp()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(6)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 6 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">
              שלחו ללקוח קישור GetLink (חיצוני), ואז הדביקו userId + פרטי עסק ל־/vaad-pay.
            </p>
            <label className="sa-check">
              <input
                type="checkbox"
                checked={collectionsOn}
                onChange={(e) => setCollectionsOn(e.target.checked)}
              />
              הפעל תוסף גבייה
            </label>
            <label className="sa-check">
              <input
                type="checkbox"
                checked={growEnabled}
                onChange={(e) => setGrowEnabled(e.target.checked)}
              />
              grow_enabled
            </label>
            <label className="sa-field">
              <span>Grow userId</span>
              <input className="sa-input" value={growUserId} onChange={(e) => setGrowUserId(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>שם עסק</span>
              <input className="sa-input" value={growLegalName} onChange={(e) => setGrowLegalName(e.target.value)} />
            </label>
            <label className="sa-field">
              <span>טלפון עסק</span>
              <input className="sa-input" value={growLegalPhone} onChange={(e) => setGrowLegalPhone(e.target.value)} />
            </label>
            <label className="sa-field">
              <span>כתובת עסק</span>
              <input className="sa-input" value={growLegalAddress} onChange={(e) => setGrowLegalAddress(e.target.value)} />
            </label>
            <label className="sa-field">
              <span>אימייל עסק</span>
              <input className="sa-input" value={growLegalEmail} onChange={(e) => setGrowLegalEmail(e.target.value)} />
            </label>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveGrow()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(7)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 7 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">מפתחות Financy לחיבור בנק — אופציונלי לשקה רכה.</p>
            <label className="sa-check">
              <input
                type="checkbox"
                checked={financyEnabled}
                onChange={(e) => setFinancyEnabled(e.target.checked)}
              />
              financy_enabled
            </label>
            <label className="sa-field">
              <span>Client ID</span>
              <input className="sa-input" value={financyClientId} onChange={(e) => setFinancyClientId(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>
                Client Secret
                {snap.financy_client_secret_set ? ' (שמור)' : ''}
              </span>
              <input
                className="sa-input"
                type="password"
                value={financySecret}
                onChange={(e) => setFinancySecret(e.target.value)}
                dir="ltr"
              />
            </label>
            <label className="sa-field">
              <span>User ID</span>
              <input className="sa-input" value={financyUserId} onChange={(e) => setFinancyUserId(e.target.value)} dir="ltr" />
            </label>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveFinancy()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(8)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 8 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">פרטי PalGate פר־לקוח. מפעיל גם את תפריט החניונים.</p>
            <label className="sa-check">
              <input
                type="checkbox"
                checked={palgateEnabled}
                onChange={(e) => setPalgateEnabled(e.target.checked)}
              />
              הפעל PalGate / חניון
            </label>
            <label className="sa-field">
              <span>Device ID</span>
              <input className="sa-input" value={palgateDevice} onChange={(e) => setPalgateDevice(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>Phone (972…)</span>
              <input className="sa-input" value={palgatePhone} onChange={(e) => setPalgatePhone(e.target.value)} dir="ltr" />
            </label>
            <label className="sa-field">
              <span>
                Session token (hex)
                {snap.palgate_session_token_set ? ' (שמור)' : ''}
              </span>
              <input
                className="sa-input"
                type="password"
                value={palgateToken}
                onChange={(e) => setPalgateToken(e.target.value)}
                dir="ltr"
              />
            </label>
            <label className="sa-field">
              <span>Token type</span>
              <select
                className="sa-input"
                value={palgateTokenType}
                onChange={(e) => setPalgateTokenType(e.target.value)}
              >
                <option value="sms">sms</option>
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
              </select>
            </label>
            <label className="sa-field">
              <span>Base URL (אופציונלי)</span>
              <input className="sa-input" value={palgateBase} onChange={(e) => setPalgateBase(e.target.value)} dir="ltr" />
            </label>
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void savePalgate()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(9)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 9 && activeClientId && (
          <div className="sa-form-stack">
            <label className="sa-field">
              <span>Email slug → slug@bino.casa</span>
              <input
                className="sa-input"
                value={emailSlug}
                onChange={(e) => setEmailSlug(e.target.value)}
                dir="ltr"
                placeholder="bamakor"
              />
            </label>
            <ClientLogoUpload
              clientId={activeClientId}
              clientName={clientName || companyName || 'client'}
              onUploaded={() => onClientsChanged?.()}
            />
            <div className="sa-wizard-actions">
              <LoadingButton
                type="button"
                loading={busy}
                className="sa-btn sa-btn-primary"
                onClick={() => void saveBranding()}
              >
                שמור והמשך
              </LoadingButton>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => goStep(10)}>
                דלג
              </button>
            </div>
          </div>
        )}

        {step === 10 && activeClientId && (
          <div className="sa-form-stack">
            <p className="sa-hint">סיכום סטטוס + בדיקות חיות. אחרי זה הלקוח מוכן לעבודה.</p>
            <ClientLaunchChecklistPanel
              clientId={activeClientId}
              onOpenTask={onOpenTask || (() => undefined)}
            />
            <button type="button" className="sa-btn sa-btn-primary" onClick={onExit}>
              סיום — חזרה ללקוח
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
