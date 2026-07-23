'use client'

/**
 * Settings: Next.js 16 / React 19 / TypeScript / Supabase / inline CSS (theme from ui), RTL Hebrew UI.
 * Style aligned with app/projects/page.tsx — Card, Button, theme.colors, form patterns.
 * WhatsApp credentials are stored in Supabase `clients` (not .env); env vars remain read-only at runtime for server defaults elsewhere.
 */

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  Card,
  Button,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageTransitionLoader } from '../components/page-skeleton'
import { useSidebarNav } from '../components/SidebarNavContext'
import { usePaidAddons } from '../components/PaidAddonsContext'
import { navIdsForEnabledAddonKeys } from '@/lib/paid-addons'
import {
  DEFAULT_SIDEBAR_NAV_ORDER,
  parseSidebarNavOrderFromDb,
  parseSidebarNavLabelsFromDb,
  resolveSidebarNavOrderIds,
  SIDEBAR_NAV_REGISTRY,
  type SidebarNavItemId,
  type SidebarNavLabels,
} from '@/lib/sidebar-nav'
import {
  GREENINVOICE_CLEARING_LABELS,
  GREENINVOICE_DOC_TYPE_LABELS,
  GREENINVOICE_VAT_TYPE_LABELS,
  type GreenInvoiceBusinessSummary,
  type GreenInvoiceClearingPlugin,
  type GreenInvoiceEnv,
} from '@/lib/greeninvoice-config'
type ClientRow = {
  id: string
  name?: string | null
  logo_url?: string | null
  whatsapp_business_phone?: string | null
  manager_phone?: string | null
  default_worker_phone?: string | null
  sms_on_ticket_open?: boolean | null
  sms_on_ticket_close?: boolean | null
  whatsapp_phone_number_id?: string | null
  whatsapp_access_token_set?: boolean
  sms_sender_name?: string | null
  greeninvoice_enabled?: boolean | null
  greeninvoice_env?: string | null
  greeninvoice_api_key_id?: string | null
  greeninvoice_api_secret_set?: boolean
  greeninvoice_business_id?: string | null
  greeninvoice_clearing_plugin?: string | null
  greeninvoice_default_doc_type?: number | null
  greeninvoice_vat_type?: number | null
  greeninvoice_send_invoice_email?: boolean | null
  greeninvoice_remarks_template?: string | null
  greeninvoice_payment_success_url?: string | null
  greeninvoice_payment_failure_url?: string | null
}

const TABS = [
  { id: 'notifications', label: 'התראות' },
  { id: 'whatsapp', label: 'וואטסאפ / הטמעה' },
  { id: 'greeninvoice', label: 'חשבונית ירוקה' },
  { id: 'navigation', label: 'תפריט צד' },
  { id: 'team', label: 'משתמשי משרד' },
] as const

type TabId = (typeof TABS)[number]['id']

type OrgUser = {
  id: string
  user_id: string
  email: string
  role: string
  created_at: string
}

function SettingsPageInner() {
  const router = useRouter()
  const { openMenu } = useMobileMenu()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TabId | null
  const activeTab: TabId =
    tabFromUrl && TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'notifications'

  function goTab(id: TabId) {
    router.replace(`/settings?tab=${encodeURIComponent(id)}`, { scroll: false })
    if (id === 'team') void loadTeam()
  }

  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  const [clientId, setClientId] = useState<string>('')
  const [client, setClient] = useState<ClientRow | null>(null)
  const [settingsHydrated, setSettingsHydrated] = useState(false)

  const [managerPhone, setManagerPhone] = useState('')
  const [defaultWorkerPhone, setDefaultWorkerPhone] = useState('')
  const [smsSenderName, setSmsSenderName] = useState('')
  const [smsOnOpen, setSmsOnOpen] = useState(true)
  const [smsOnClose, setSmsOnClose] = useState(true)
  const [clientName, setClientName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const [waBusinessPhone, setWaBusinessPhone] = useState('')
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waAccessToken, setWaAccessToken] = useState('')
  const [waTokenLoaded, setWaTokenLoaded] = useState(false)
  const [whatsappAccessTokenSet, setWhatsappAccessTokenSet] = useState(false)

  const [giEnabled, setGiEnabled] = useState(false)
  const [giEnv, setGiEnv] = useState<GreenInvoiceEnv>('production')
  const [giApiKeyId, setGiApiKeyId] = useState('')
  const [giApiSecret, setGiApiSecret] = useState('')
  const [giSecretLoaded, setGiSecretLoaded] = useState(false)
  const [giBusinessId, setGiBusinessId] = useState('')
  const [giBusinesses, setGiBusinesses] = useState<GreenInvoiceBusinessSummary[]>([])
  const [giClearingPlugin, setGiClearingPlugin] = useState<GreenInvoiceClearingPlugin | ''>('')
  const [giDocType, setGiDocType] = useState<300 | 305 | 320>(300)
  const [giVatType, setGiVatType] = useState<0 | 1 | 2>(0)
  const [giSendEmail, setGiSendEmail] = useState(true)
  const [giRemarksTemplate, setGiRemarksTemplate] = useState('')
  const [giPaymentSuccessUrl, setGiPaymentSuccessUrl] = useState('')
  const [giPaymentFailureUrl, setGiPaymentFailureUrl] = useState('')
  const [savingGreeninvoice, setSavingGreeninvoice] = useState(false)
  const [testingGi, setTestingGi] = useState(false)

  const [savingNotifications, setSavingNotifications] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const [testingWa, setTestingWa] = useState(false)
  const [testingSms, setTestingSms] = useState(false)
  const [pushEnabling, setPushEnabling] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  // Team tab state
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'viewer' | 'manager' | 'admin'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const [navOrderDraft, setNavOrderDraft] = useState<SidebarNavItemId[]>([...DEFAULT_SIDEBAR_NAV_ORDER])
  const [navLabelsDraft, setNavLabelsDraft] = useState<Record<string, string>>({})
  const [savingNav, setSavingNav] = useState(false)
  const { setLocalOrderIds, refreshNav } = useSidebarNav()
  const { addons } = usePaidAddons()

  const enabledAddonNavIds = useMemo(
    () => navIdsForEnabledAddonKeys(addons.filter((a) => a.enabled).map((a) => a.addon_key)),
    [addons]
  )

  const addonOnlyNavIds = useMemo(
    () => enabledAddonNavIds.filter((id) => !navOrderDraft.includes(id)),
    [enabledAddonNavIds, navOrderDraft]
  )

  const [origin, setOrigin] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only origin for webhook URL
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  }, [])

  const webhookUrl = useMemo(
    () => (origin ? `${origin}/api/webhook/whatsapp` : '/api/webhook/whatsapp'),
    [origin]
  )

  const greeninvoiceWebhookUrl = useMemo(
    () => (origin ? `${origin}/api/webhook/greeninvoice` : '/api/webhook/greeninvoice'),
    [origin]
  )

  async function load() {
    setLoading(true)
    setSettingsHydrated(false)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/settings/read')
        const row = (await res.json().catch(() => ({}))) as ClientRow & { error?: string }
        if (!res.ok) throw new Error(row.error || 'טעינת הגדרות נכשלה')
        if (!row?.id) throw new Error('לא נמצא רשומת לקוח')

        setClientId(row.id)
        setClient(row)
        setClientName(row.name?.trim() || '')
        setLogoUrl(row.logo_url?.trim() || null)

        setManagerPhone(row.manager_phone || '')
        setDefaultWorkerPhone(row.default_worker_phone || '')
        setSmsSenderName(row.sms_sender_name || '')
        setSmsOnOpen(row.sms_on_ticket_open !== false)
        setSmsOnClose(row.sms_on_ticket_close !== false)

        setWaBusinessPhone(row.whatsapp_business_phone || '')
        setWaPhoneNumberId(row.whatsapp_phone_number_id || '')
        setWaAccessToken('')
        setWhatsappAccessTokenSet(row.whatsapp_access_token_set === true)
        setWaTokenLoaded(true)

        setGiEnabled(row.greeninvoice_enabled === true)
        setGiEnv(row.greeninvoice_env === 'sandbox' ? 'sandbox' : 'production')
        setGiApiKeyId(row.greeninvoice_api_key_id || '')
        setGiApiSecret('')
        setGiSecretLoaded(row.greeninvoice_api_secret_set === true)
        setGiBusinessId(row.greeninvoice_business_id || '')
        setGiClearingPlugin(
          row.greeninvoice_clearing_plugin === 'cardcom' ||
            row.greeninvoice_clearing_plugin === 'isracard' ||
            row.greeninvoice_clearing_plugin === 'grow'
            ? row.greeninvoice_clearing_plugin
            : ''
        )
        setGiDocType(
          row.greeninvoice_default_doc_type === 305 || row.greeninvoice_default_doc_type === 320
            ? row.greeninvoice_default_doc_type
            : 300
        )
        setGiVatType(
          row.greeninvoice_vat_type === 1 || row.greeninvoice_vat_type === 2
            ? row.greeninvoice_vat_type
            : 0
        )
        setGiSendEmail(row.greeninvoice_send_invoice_email !== false)
        setGiRemarksTemplate(row.greeninvoice_remarks_template || '')
        setGiPaymentSuccessUrl(row.greeninvoice_payment_success_url || '')
        setGiPaymentFailureUrl(row.greeninvoice_payment_failure_url || '')
        setGiBusinesses([])

        const parsedOrder = parseSidebarNavOrderFromDb(
          (row as { sidebar_nav_order?: unknown }).sidebar_nav_order
        )
        setNavOrderDraft(
          parsedOrder ? resolveSidebarNavOrderIds(parsedOrder) : [...DEFAULT_SIDEBAR_NAV_ORDER]
        )

        let parsedLabels: SidebarNavLabels = {}
        try {
          const navRes = await fetchWithTimeout('/api/client/nav-config')
          const navJson = (await navRes.json().catch(() => ({}))) as {
            sidebar_nav_labels?: unknown
            error?: string
          }
          if (navRes.ok) {
            parsedLabels = parseSidebarNavLabelsFromDb(navJson.sidebar_nav_labels)
          }
        } catch {
          /* nav labels optional — phones must still load */
        }

        const labelDraft: Record<string, string> = {}
        for (const id of Object.keys(SIDEBAR_NAV_REGISTRY) as SidebarNavItemId[]) {
          labelDraft[id] = parsedLabels[id] ?? SIDEBAR_NAV_REGISTRY[id].label
        }
        setNavLabelsDraft(labelDraft)
        setSettingsHydrated(true)

        return true
      },
      { context: 'טעינת הגדרות נכשלה — הריצו מיגרציה ל-clients אם עדיין לא', showErrorToast: true }
    )
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Supabase
    void load()
  }, [])

  async function saveNotifications() {
    if (!clientId || !settingsHydrated) {
      toast.error('ההגדרות טרם נטענו — רעננו את הדף לפני שמירה')
      return
    }
    setSavingNotifications(true)
    await asyncHandler(
      async () => {
        const payload = {
          manager_phone: managerPhone.trim() || null,
          default_worker_phone: defaultWorkerPhone.trim() || null,
          sms_sender_name: smsSenderName.trim() || null,
          sms_on_ticket_open: smsOnOpen,
          sms_on_ticket_close: smsOnClose,
        }
        const res = await fetchWithTimeout(
          '/api/settings/update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'שמירה נכשלה')
        toast.success(TM.settingsSaved)
        await load()
        return true
      },
      { context: 'שמירה נכשלה', showErrorToast: true }
    )
    setSavingNotifications(false)
  }

  function moveNavItem(index: number, direction: -1 | 1) {
    setNavOrderDraft((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function buildNavLabelsPayload(): SidebarNavLabels {
    const out: SidebarNavLabels = {}
    for (const [id, label] of Object.entries(navLabelsDraft)) {
      if (!(id in SIDEBAR_NAV_REGISTRY)) continue
      const trimmed = label.trim()
      const defaultLabel = SIDEBAR_NAV_REGISTRY[id as SidebarNavItemId].label
      if (trimmed && trimmed !== defaultLabel) {
        out[id as SidebarNavItemId] = trimmed
      }
    }
    return out
  }

  async function saveNavigation() {
    if (!clientId) return
    setSavingNav(true)
    await asyncHandler(
      async () => {
        const sidebar_nav_labels = buildNavLabelsPayload()
        const res = await fetchWithTimeout(
          '/api/settings/update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sidebar_nav_order: navOrderDraft, sidebar_nav_labels }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'שמירה נכשלה'))
        setLocalOrderIds(navOrderDraft)
        await refreshNav()
        const labelPayload = buildNavLabelsPayload()
        const labelDraft: Record<string, string> = {}
        for (const id of Object.keys(SIDEBAR_NAV_REGISTRY) as SidebarNavItemId[]) {
          labelDraft[id] = labelPayload[id] ?? SIDEBAR_NAV_REGISTRY[id].label
        }
        setNavLabelsDraft(labelDraft)
        toast.success(TM.settingsSaved)
        return true
      },
      { context: 'שמירת סדר התפריט נכשלה', showErrorToast: true }
    )
    setSavingNav(false)
  }

  async function saveWhatsapp() {
    if (!clientId) return
    setSavingWhatsapp(true)
    await asyncHandler(
      async () => {
        const payload: Record<string, string | null> = {
          whatsapp_business_phone: waBusinessPhone.trim() || null,
          whatsapp_phone_number_id: waPhoneNumberId.trim() || null,
        }
        if (waAccessToken.trim()) {
          payload.whatsapp_access_token = waAccessToken.trim()
        }
        const res = await fetchWithTimeout(
          '/api/settings/update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'שמירה נכשלה')
        toast.success(TM.settingsSaved)
        await load()
        return true
      },
      { context: 'שמירה נכשלה', showErrorToast: true }
    )
    setSavingWhatsapp(false)
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success('הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function copyGreeninvoiceWebhook() {
    try {
      await navigator.clipboard.writeText(greeninvoiceWebhookUrl)
      toast.success('הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function saveGreeninvoice() {
    if (!clientId) return
    setSavingGreeninvoice(true)
    await asyncHandler(
      async () => {
        const payload: Record<string, string | number | boolean | null> = {
          greeninvoice_enabled: giEnabled,
          greeninvoice_env: giEnv,
          greeninvoice_api_key_id: giApiKeyId.trim() || null,
          greeninvoice_business_id: giBusinessId.trim() || null,
          greeninvoice_clearing_plugin: giClearingPlugin || null,
          greeninvoice_default_doc_type: giDocType,
          greeninvoice_vat_type: giVatType,
          greeninvoice_send_invoice_email: giSendEmail,
          greeninvoice_remarks_template: giRemarksTemplate.trim() || null,
          greeninvoice_payment_success_url: giPaymentSuccessUrl.trim() || null,
          greeninvoice_payment_failure_url: giPaymentFailureUrl.trim() || null,
        }
        if (giApiSecret.trim()) {
          payload.greeninvoice_api_secret = giApiSecret.trim()
        }
        const res = await fetchWithTimeout(
          '/api/settings/update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'שמירה נכשלה')
        toast.success(TM.settingsSaved)
        await load()
        return true
      },
      { context: 'שמירת הגדרות חשבונית ירוקה נכשלה', showErrorToast: true }
    )
    setSavingGreeninvoice(false)
  }

  async function testGreeninvoice() {
    setTestingGi(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/settings/test-greeninvoice', { method: 'POST' })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          businesses?: GreenInvoiceBusinessSummary[]
          currentBusiness?: GreenInvoiceBusinessSummary | null
        }
        if (!res.ok) throw new Error(json.error || 'בדיקת חיבור נכשלה')
        const list = json.businesses ?? []
        setGiBusinesses(list)
        if (!giBusinessId.trim() && json.currentBusiness?.id) {
          setGiBusinessId(json.currentBusiness.id)
        }
        const names = list.map((b) => b.name).join(', ')
        toast.success(names ? `חיבור תקין — עסקים: ${names}` : 'חיבור תקין')
        return true
      },
      { context: 'בדיקת חיבור ל-Morning נכשלה', showErrorToast: true }
    )
    setTestingGi(false)
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const outputArray = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; ++i) outputArray[i] = raw.charCodeAt(i)
    return outputArray
  }

  async function enablePushNotifications() {
    const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
    if (!vapid) {
      toast.error('חסר NEXT_PUBLIC_VAPID_PUBLIC_KEY בשרת')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('הדפדפן לא תומך בהתראות דחיפה')
      return
    }
    setPushEnabling(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        toast.error('ההרשאה נדחתה')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })
      const res = await fetchWithTimeout('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error || 'שמירה נכשלה')
      toast.success('התראות הופעלו')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעלה נכשלה')
    } finally {
      setPushEnabling(false)
    }
  }

  async function uploadClientLogo(file: File) {
    if (!clientId) return
    setLogoUploading(true)
    await asyncHandler(
      async () => {
        const form = new FormData()
        form.append('file', file)
        const res = await fetchWithTimeout(
          '/api/settings/upload-logo',
          { method: 'POST', body: form },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error || 'העלאת לוגו נכשלה')
        setLogoUrl(json.url)
        try {
          localStorage.removeItem(`bamakor_branding_v1_${clientId}`)
        } catch {
          /* ignore */
        }
        toast.success('הלוגו עודכן — יופיע גם בסקר הדיירים')
        return true
      },
      { context: 'העלאת לוגו נכשלה', showErrorToast: true }
    )
    setLogoUploading(false)
  }

  async function testSms() {
    setTestingSms(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/settings/test-sms',
          { method: 'POST' },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')
        toast.success('SMS ניסיון נשלח בהצלחה')
        return true
      },
      { context: 'בדיקת SMS נכשלה', showErrorToast: true }
    )
    setTestingSms(false)
  }

  async function testWhatsapp() {
    if (!clientId) return
    setTestingWa(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/settings/test-whatsapp',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'בדיקה נכשלה')
        toast.success('הודעת בדיקה נשלחה')
        return true
      },
      { context: 'בדיקת וואטסאפ נכשלה', showErrorToast: true }
    )
    setTestingWa(false)
  }

  async function loadTeam() {
    setTeamLoading(true)
    try {
      const res = await fetchWithTimeout('/api/invite-worker', { method: 'GET' })
      const json = await res.json() as { users?: OrgUser[] }
      setOrgUsers(json.users ?? [])
    } catch {
      toast.error('טעינת הצוות נכשלה')
    } finally {
      setTeamLoading(false)
    }
  }

  async function doInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetchWithTimeout('/api/invite-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')
      toast.success(`הזמנה נשלחה ל-${inviteEmail.trim()}`)
      setInviteEmail('')
      await loadTeam()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setInviting(false)
    }
  }

  async function doRemove(ouId: string) {
    setRemovingId(ouId)
    try {
      const res = await fetchWithTimeout(`/api/invite-worker?id=${encodeURIComponent(ouId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('הסרה נכשלה')
      toast.success('משתמש הוסר')
      setOrgUsers((prev) => prev.filter((u) => u.id !== ouId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הסרה נכשלה')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="הגדרות"
          subtitle="העדפות מערכת"
          onMenuClick={openMenu}
        />
      )}

      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }
            : {}),
        }}
      >
        {!isMobile && (
          <PageHeader title="הגדרות" subtitle="התראות ווואטסאפ" />
        )}

        <p style={{ margin: '0 0 16px', fontSize: '14px', color: theme.colors.textMuted }}>
          <Link href="/privacy">מדיניות פרטיות</Link> · קובץ התבניה המלא בתיקיית הריפו{' '}
          <code>PRIVACY_POLICY_TEMPLATE.md</code>
        </p>

        {loading ? (
          <PageTransitionLoader />
        ) : (
          <>
            <div className="app-error-log-tabs" style={styles.tabBar} role="tablist" aria-label="הגדרות">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => goTab(t.id)}
                  style={{
                    ...styles.tabBtn,
                    ...(activeTab === t.id ? styles.tabBtnActive : {}),
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'notifications' && (
              <Card noPadding>
                <div style={styles.cardInner}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>לוגו לקוח (סקר דיירים + סרגל)</label>
                    <p style={styles.fieldHint}>
                      PNG/JPEG/WEBP עד 2MB. הלוגו מוצג בדף סקר הרישום הציבורי ובסרגל הצד.
                      {clientName ? ` לקוח: ${clientName}.` : ''}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl || '/apple-icon.png'}
                        alt={clientName || 'לוגו'}
                        width={56}
                        height={56}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: theme.radius.md,
                          objectFit: 'contain',
                          border: `1px solid ${theme.colors.border}`,
                          background: theme.colors.muted,
                        }}
                      />
                      <div>
                        <input
                          id="settings-client-logo"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void uploadClientLogo(file)
                            e.target.value = ''
                          }}
                        />
                        <LoadingButton
                          size="sm"
                          loading={logoUploading}
                          loadingText="מעלה..."
                          onClick={() => document.getElementById('settings-client-logo')?.click()}
                        >
                          {logoUrl ? 'החלף לוגו' : 'העלה לוגו'}
                        </LoadingButton>
                      </div>
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>טלפון מנהל</label>
                    <input
                      type="tel"
                      value={managerPhone}
                      onChange={(e) => setManagerPhone(e.target.value)}
                      style={styles.input}
                      placeholder="05xxxxxxxx"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>טלפון עובד ברירת מחדל</label>
                    <input
                      type="tel"
                      value={defaultWorkerPhone}
                      onChange={(e) => setDefaultWorkerPhone(e.target.value)}
                      style={styles.input}
                      placeholder="אופציונלי"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>מזהה שולח SMS (019) — פר לקוח</label>
                    <input
                      type="text"
                      value={smsSenderName}
                      onChange={(e) => setSmsSenderName(e.target.value)}
                      style={styles.input}
                      placeholder="לדוגמה: Bamakor או 0501234567 (עד 11 תווים לטיניים/ספרות)"
                      maxLength={11}
                      dir="ltr"
                    />
                    <p style={styles.fieldHint}>
                      מה שיופיע לנמען בשדה &quot;מאת&quot; בהודעת SMS. <strong>חייב להיות אותיות לטיניות/ספרות בלבד</strong>, 3–11 תווים (לדוגמה: Bamakor).
                      תווים בעברית יימחקו אוטומטית — אם ריק תישלח עם שולח &quot;Bamakor&quot;.
                    </p>
                    {smsSenderName && /[^\x00-\x7F]/.test(smsSenderName) && (
                      <p style={{ ...styles.fieldHint, color: theme.colors.warning, fontWeight: 600 }}>
                        ⚠️ השם מכיל תווים לא תקינים — לאחר שמירה ישלח SMS עם שולח &quot;Bamakor&quot;
                      </p>
                    )}
                  </div>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={smsOnOpen}
                      onChange={(e) => setSmsOnOpen(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>שלח SMS בפתיחת תקלה</span>
                  </label>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={smsOnClose}
                      onChange={(e) => setSmsOnClose(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>שלח SMS בסגירת תקלה</span>
                  </label>
                  <div
                    style={{
                      marginTop: '20px',
                      paddingTop: '20px',
                      borderTop: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    <label style={styles.formLabel}>התראות דחיפה (PWA)</label>
                    <p style={styles.formHint}>
                      קבלת התראה כשנפתחת תקלה חדשה. נדרשים מפתחות VAPID בשרת (ציבורי גם ב־NEXT_PUBLIC).
                    </p>
                    <LoadingButton
                      variant="secondary"
                      type="button"
                      onClick={enablePushNotifications}
                      loading={pushEnabling}
                      loadingText="מפעיל..."
                    >
                      הפעל התראות
                    </LoadingButton>
                  </div>
                  <div
                    style={{
                      marginTop: '20px',
                      paddingTop: '20px',
                      borderTop: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    <label style={styles.formLabel}>שליחת מייל (Resend)</label>
                    <p style={styles.formHint}>
                      דורש RESEND_API_KEY בשרת. Gmail/Outlook inbox — שלב עתידי (Coexistence / OAuth).
                    </p>
                    <div style={styles.formGroup}>
                      <input
                        type="email"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        style={styles.input}
                        placeholder="נמען@example.com"
                        dir="ltr"
                        aria-label="כתובת מייל נמען"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        style={styles.input}
                        placeholder="נושא"
                        aria-label="נושא המייל"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        style={{ ...styles.input, minHeight: 80 }}
                        placeholder="גוף ההודעה"
                        aria-label="גוף המייל"
                      />
                    </div>
                    <LoadingButton
                      variant="secondary"
                      type="button"
                      loading={emailSending}
                      loadingText="שולח..."
                      onClick={async () => {
                        if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
                          toast.error('נא למלא נמען, נושא וגוף')
                          return
                        }
                        setEmailSending(true)
                        try {
                          const res = await fetchWithTimeout('/api/email/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              to: emailTo.trim(),
                              subject: emailSubject.trim(),
                              body: emailBody.trim(),
                            }),
                          })
                          const json = (await res.json()) as { error?: string }
                          if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
                          toast.success('המייל נשלח')
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
                        } finally {
                          setEmailSending(false)
                        }
                      }}
                    >
                      שלח מייל
                    </LoadingButton>
                  </div>
                  <div style={styles.drawerActions}>
                    <LoadingButton
                      variant="secondary"
                      type="button"
                      onClick={testSms}
                      loading={testingSms}
                      loadingText="שולח..."
                    >
                      בדוק SMS
                    </LoadingButton>
                    <LoadingButton
                      variant="primary"
                      onClick={saveNotifications}
                      loading={savingNotifications}
                      loadingText="שומר..."
                    >
                      שמור שינויים
                    </LoadingButton>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'whatsapp' && (
              <Card noPadding>
                  <div style={styles.cardInner}>
                    <div style={styles.waTemplatesLinkBox}>
                      <div>
                        <div style={styles.formLabel}>תבניות הודעות לדיירים</div>
                        <p style={styles.formHint}>
                          עריכת טקסטים לשלבי onboarding, בחירת בניין, מדיה וסגירה — בדף ייעודי.
                        </p>
                      </div>
                      <Link href="/settings/whatsapp-templates" style={styles.waTemplatesLink}>
                        לעריכת תבניות →
                      </Link>
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>מספר וואטסאפ לקישורי QR (wa.me)</label>
                    <input
                      value={waBusinessPhone}
                      onChange={(e) => setWaBusinessPhone(e.target.value)}
                      style={styles.input}
                      placeholder="למשל 972501234567 או 050-1234567"
                    />
                    <span style={styles.formHint}>
                      אם ריק — ייעשה שימוש במספר מנהל או בעובד ברירת מחדל מהתראות. הריצו מיגרציה 023 אם השדה לא קיים.
                    </span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>WhatsApp Phone Number ID</label>
                    <input
                      value={waPhoneNumberId}
                      onChange={(e) => setWaPhoneNumberId(e.target.value)}
                      style={styles.input}
                      placeholder="מזהה מספר מטא"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>WhatsApp Access Token</label>
                    <input
                      type="password"
                      value={waAccessToken}
                      onChange={(e) => setWaAccessToken(e.target.value)}
                      style={styles.input}
                      placeholder={
                        waTokenLoaded && whatsappAccessTokenSet
                          ? 'הזינו טוקן חדש להחלפה'
                          : 'הדביקו טוקן ארוך-טווח'
                      }
                      autoComplete="off"
                    />
                    <span style={styles.formHint}>השאירו ריק אם אינכם משנים את הטוקן השמור</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Webhook URL (קריאה בלבד)</label>
                    <div style={styles.readonlyRow}>
                      <input readOnly value={webhookUrl} style={{ ...styles.input, flex: 1 }} />
                      <Button variant="secondary" type="button" onClick={copyWebhook}>
                        העתק
                      </Button>
                    </div>
                  </div>
                  <div style={styles.drawerActions}>
                    <LoadingButton
                      variant="secondary"
                      type="button"
                      onClick={testWhatsapp}
                      loading={testingWa}
                      loadingText="בודק..."
                    >
                      בדוק חיבור
                    </LoadingButton>
                    <LoadingButton
                      variant="primary"
                      onClick={saveWhatsapp}
                      loading={savingWhatsapp}
                      loadingText="שומר..."
                    >
                      שמור שינויים
                    </LoadingButton>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'greeninvoice' && (
              <Card noPadding>
                <div style={styles.cardInner}>
                  <p style={{ margin: 0, fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
                    חיבור ל-Morning (חשבונית ירוקה) לגביית ועד — מפתחות API, סליקה ומסמכים. נדרש מנוי Best+ ב-Morning
                    ופלאגין סליקה פעיל (Cardcom / Isracard / Grow).
                  </p>

                  <div style={styles.formGroup}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={giEnabled}
                        onChange={(e) => setGiEnabled(e.target.checked)}
                        style={styles.checkbox}
                      />
                      הפעל גבייה דרך חשבונית ירוקה
                    </label>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>סביבת API</label>
                    <select
                      value={giEnv}
                      onChange={(e) => setGiEnv(e.target.value as GreenInvoiceEnv)}
                      style={styles.input}
                    >
                      <option value="production">פרודקשן (חי)</option>
                      <option value="sandbox">Sandbox (בדיקות)</option>
                    </select>
                    <span style={styles.formHint}>
                      Sandbox: הרשמה ב-lp.sandbox.d.greeninvoice.co.il — מפתחות נפרדים מפרודקשן.
                    </span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>מפתח API (Key ID)</label>
                    <input
                      value={giApiKeyId}
                      onChange={(e) => setGiApiKeyId(e.target.value)}
                      style={styles.input}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoComplete="off"
                    />
                    <span style={styles.formHint}>
                      Morning → הגדרות → מתקדם → מפתחות API → צור מפתח API
                    </span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>סוד API (Secret)</label>
                    <input
                      type="password"
                      value={giApiSecret}
                      onChange={(e) => setGiApiSecret(e.target.value)}
                      style={styles.input}
                      placeholder={
                        giSecretLoaded
                          ? 'הזינו סוד חדש להחלפה'
                          : 'מוצג פעם אחת ביצירת המפתח — הדביקו כאן'
                      }
                      autoComplete="off"
                    />
                    <span style={styles.formHint}>השאירו ריק אם אינכם משנים את הסוד השמור. שמרו לפני «בדוק חיבור».</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>עסק ב-Morning</label>
                    {giBusinesses.length > 0 ? (
                      <select
                        value={giBusinessId}
                        onChange={(e) => setGiBusinessId(e.target.value)}
                        style={styles.input}
                      >
                        <option value="">— בחרו עסק —</option>
                        {giBusinesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={giBusinessId}
                        onChange={(e) => setGiBusinessId(e.target.value)}
                        style={styles.input}
                        placeholder="מזהה עסק (אופציונלי — הריצו בדיקת חיבור לרשימה)"
                      />
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>פלאגין סליקה ב-Morning</label>
                    <select
                      value={giClearingPlugin}
                      onChange={(e) =>
                        setGiClearingPlugin(e.target.value as GreenInvoiceClearingPlugin | '')
                      }
                      style={styles.input}
                    >
                      <option value="">— לא נבחר / לא ידוע —</option>
                      {(Object.keys(GREENINVOICE_CLEARING_LABELS) as GreenInvoiceClearingPlugin[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {GREENINVOICE_CLEARING_LABELS[key]}
                          </option>
                        )
                      )}
                    </select>
                    <span style={styles.formHint}>
                      מידע לתיעוד בלבד — הסליקה מוגדרת בחשבון Morning, לא במערכת Bamakor.
                    </span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>סוג מסמך ברירת מחדל לחיוב</label>
                    <select
                      value={giDocType}
                      onChange={(e) => setGiDocType(Number(e.target.value) as 300 | 305 | 320)}
                      style={styles.input}
                    >
                      {Object.entries(GREENINVOICE_DOC_TYPE_LABELS).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>הצהרת מע&quot;מ במסמך</label>
                    <select
                      value={giVatType}
                      onChange={(e) => setGiVatType(Number(e.target.value) as 0 | 1 | 2)}
                      style={styles.input}
                    >
                      {Object.entries(GREENINVOICE_VAT_TYPE_LABELS).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>הערות קבועות במסמך (תבנית)</label>
                    <textarea
                      value={giRemarksTemplate}
                      onChange={(e) => setGiRemarksTemplate(e.target.value)}
                      style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                      placeholder="למשל: דמי ועד בית — חודש {month}/{year}"
                      maxLength={2000}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={giSendEmail}
                        onChange={(e) => setGiSendEmail(e.target.checked)}
                        style={styles.checkbox}
                      />
                      שלח מסמך במייל לדייר (כש-Morning תומך)
                    </label>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>כתובת חזרה אחרי תשלום מוצלח (אופציונלי)</label>
                    <input
                      value={giPaymentSuccessUrl}
                      onChange={(e) => setGiPaymentSuccessUrl(e.target.value)}
                      style={styles.input}
                      placeholder="https://..."
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>כתובת חזרה אחרי תשלום שנכשל (אופציונלי)</label>
                    <input
                      value={giPaymentFailureUrl}
                      onChange={(e) => setGiPaymentFailureUrl(e.target.value)}
                      style={styles.input}
                      placeholder="https://..."
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Webhook URL (קריאה בלבד)</label>
                    <div style={styles.readonlyRow}>
                      <input readOnly value={greeninvoiceWebhookUrl} style={{ ...styles.input, flex: 1 }} />
                      <Button variant="secondary" type="button" onClick={copyGreeninvoiceWebhook}>
                        העתק
                      </Button>
                    </div>
                    <span style={styles.formHint}>
                      הגדירו ב-Morning → Webhooks — לעדכון סטטוס תשלום אוטומטי (בקרוב).
                    </span>
                  </div>

                  <div style={styles.drawerActions}>
                    <LoadingButton
                      variant="secondary"
                      type="button"
                      onClick={testGreeninvoice}
                      loading={testingGi}
                      loadingText="בודק..."
                    >
                      בדוק חיבור
                    </LoadingButton>
                    <LoadingButton
                      variant="primary"
                      onClick={saveGreeninvoice}
                      loading={savingGreeninvoice}
                      loadingText="שומר..."
                    >
                      שמור שינויים
                    </LoadingButton>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'navigation' && (
              <Card noPadding>
                <div style={styles.cardInner}>
                  <p style={{ margin: 0, fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
                    סדר ושמות הלשוניות בתפריט הצד (ובתפריט הנייד) לכל משתמשי הלקוח. ארבע הלשוניות בתחתית המסך נשארות:
                    לוח בקרה, תקלות, פרויקטים והעובדים שלי — כפתור &quot;עוד&quot; או תפריט ההמבורגר פותחים את כל שאר הפריטים.
                  </p>
                  <ul style={styles.navOrderList}>
                    {navOrderDraft.map((id, index) => {
                      const item = SIDEBAR_NAV_REGISTRY[id]
                      return (
                        <li key={id} style={styles.navOrderRow}>
                          <span style={styles.navOrderIndex}>{index + 1}</span>
                          <input
                            type="text"
                            value={navLabelsDraft[id] ?? item.label}
                            onChange={(e) =>
                              setNavLabelsDraft((prev) => ({ ...prev, [id]: e.target.value }))
                            }
                            style={styles.navLabelInput}
                            aria-label={`שם תצוגה: ${item.label}`}
                          />
                          <div style={styles.navOrderActions}>
                            <button
                              type="button"
                              style={styles.navOrderBtn}
                              disabled={index === 0}
                              onClick={() => moveNavItem(index, -1)}
                              aria-label={`העלה את ${item.label}`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              style={styles.navOrderBtn}
                              disabled={index === navOrderDraft.length - 1}
                              onClick={() => moveNavItem(index, 1)}
                              aria-label={`הורד את ${item.label}`}
                            >
                              ↓
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {addonOnlyNavIds.length > 0 ? (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary }}>
                        תוספים פעילים (שם בתפריט)
                      </p>
                      <ul style={styles.navOrderList}>
                        {addonOnlyNavIds.map((id) => {
                          const item = SIDEBAR_NAV_REGISTRY[id]
                          return (
                            <li key={id} style={styles.navOrderRow}>
                              <span style={styles.navOrderIndex}>+</span>
                              <input
                                type="text"
                                value={navLabelsDraft[id] ?? item.label}
                                onChange={(e) =>
                                  setNavLabelsDraft((prev) => ({ ...prev, [id]: e.target.value }))
                                }
                                style={styles.navLabelInput}
                                aria-label={`שם תצוגה: ${item.label}`}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                  <div style={styles.drawerActions}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNavOrderDraft([...DEFAULT_SIDEBAR_NAV_ORDER])
                        const labelDraft: Record<string, string> = {}
                        for (const id of Object.keys(SIDEBAR_NAV_REGISTRY) as SidebarNavItemId[]) {
                          labelDraft[id] = SIDEBAR_NAV_REGISTRY[id].label
                        }
                        setNavLabelsDraft(labelDraft)
                      }}
                    >
                      איפוס לברירת מחדל
                    </Button>
                    <LoadingButton
                      variant="primary"
                      type="button"
                      onClick={saveNavigation}
                      loading={savingNav}
                      loadingText="שומר..."
                    >
                      שמור תפריט
                    </LoadingButton>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'team' && (
              <Card noPadding>
                <div style={styles.cardInner}>
                  <div style={{ fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
                    מי נכנס למערכת עם Google — מנהלי משרד, לא עובדי שטח. שולחים הזמנה במייל; הם רואים את כל התקלות של הלקוח.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="כתובת מייל של משתמש המשרד"
                        style={{ ...styles.input, flex: 1, minWidth: '200px' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') void doInvite() }}
                      />
                      <select
                        className="app-select-input"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'manager' | 'admin')}
                        style={{ padding: '12px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, fontSize: '14px', color: theme.colors.textPrimary }}
                      >
                        <option value="viewer">צופה (קריאה בלבד)</option>
                        <option value="manager">מנהל</option>
                        <option value="admin">מנהל מערכת</option>
                      </select>
                      <Button variant="primary" onClick={doInvite} loading={inviting} type="button">
                        שלח הזמנה
                      </Button>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: theme.colors.textPrimary }}>משתמשים קיימים</span>
                      <Button variant="secondary" onClick={loadTeam} loading={teamLoading} type="button">
                        רענן
                      </Button>
                    </div>
                    {teamLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><LoadingSpinner /></div>
                    ) : orgUsers.length === 0 ? (
                      <div style={{ color: theme.colors.textMuted, fontSize: '13px' }}>עדיין אין משתמשים מוזמנים.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {orgUsers.map((u) => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, background: theme.colors.surfaceElevated }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 500, color: theme.colors.textPrimary }}>{u.email}</span>
                              <span style={{ fontSize: '12px', color: theme.colors.textMuted }}>{u.role === 'admin' ? 'מנהל מערכת' : u.role === 'manager' ? 'מנהל' : 'צופה'}</span>
                            </div>
                            <Button
                              variant="secondary"
                              onClick={() => void doRemove(u.id)}
                              loading={removingId === u.id}
                              type="button"
                            >
                              הסר
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <AppShell isMobile={false}>
          <div style={{ padding: '80px 40px', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner size="lg" />
          </div>
        </AppShell>
      }
    >
      <SettingsPageInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '900px',
    margin: '0 auto',
    outline: 'none',
    boxShadow: 'none',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '80px 0',
  },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '24px',
    position: 'relative',
    zIndex: 2,
  },
  waGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr minmax(260px, 320px)',
    gap: 20,
    alignItems: 'start',
  },
  waStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  tabBtn: {
    padding: '10px 16px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    position: 'relative',
    zIndex: 2,
  },
  tabBtnActive: {
    border: `1px solid ${theme.colors.primary}`,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
  },
  cardInner: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  input: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '16px',
    color: theme.colors.textPrimary,
  },
  formHint: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    margin: '4px 0 0',
  },
  waTemplatesLinkBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '14px 16px',
    marginBottom: '20px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.border}`,
  },
  waTemplatesLink: {
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  inlineLink: {
    color: theme.colors.primary,
    textDecoration: 'underline',
  },
  fieldHint: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: theme.colors.primary,
  },
  drawerActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '8px',
  },
  readonlyRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  headerSecondaryLink: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  navOrderList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  navOrderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  navOrderIndex: {
    width: '28px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    flexShrink: 0,
  },
  navOrderLabel: {
    flex: 1,
    fontSize: '15px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  navLabelInput: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    fontWeight: 600,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    minWidth: 0,
  },
  navOrderActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  navOrderBtn: {
    width: '36px',
    height: '36px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    fontSize: '16px',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
  },
}
