'use client'

/**
 * Settings: Next.js 16 / React 19 / TypeScript / Supabase / inline CSS (theme from ui), RTL Hebrew UI.
 * Style aligned with app/projects/page.tsx — Card, Button, theme.colors, form patterns.
 * WhatsApp credentials are stored in Supabase `clients` (not .env); env vars remain read-only at runtime for server defaults elsewhere.
 */

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast, asyncHandler } from '@/lib/error-handler'
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
import { CollapsibleSection } from '../components/shared/CollapsibleSection'
import { COLLECTIONS_CONNECTION_HREF } from '@/lib/collection-charges'
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
}

const TABS = [
  { id: 'general', label: 'כללי' },
  { id: 'notifications', label: 'התראות' },
  { id: 'whatsapp', label: 'וואטסאפ / הטמעה' },
  { id: 'team', label: 'משתמשי משרד' },
] as const

type TabId = (typeof TABS)[number]['id']

const COLLECTIONS_SETTINGS_LEGACY_TABS = new Set(['morning', 'greeninvoice', 'payments'])

/** Legacy tab ids: navigation removed; Morning/payments merged into /collections. */
function resolveSettingsTab(raw: string | null): TabId | 'collections_redirect' {
  if (raw === 'navigation') return 'general'
  if (raw && COLLECTIONS_SETTINGS_LEGACY_TABS.has(raw)) return 'collections_redirect'
  if (raw && TABS.some((t) => t.id === raw)) return raw as TabId
  return 'general'
}

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
  const resolvedTab = resolveSettingsTab(searchParams.get('tab'))
  const activeTab: TabId = resolvedTab === 'collections_redirect' ? 'general' : resolvedTab

  useEffect(() => {
    if (resolvedTab !== 'collections_redirect') return
    router.replace(COLLECTIONS_CONNECTION_HREF)
  }, [resolvedTab, router])

  function goTab(id: TabId) {
    router.replace(`/settings?tab=${encodeURIComponent(id)}`, { scroll: false })
    if (id === 'team') void loadTeam()
  }

  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  const [clientId, setClientId] = useState<string>('')
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

  const [savingGeneral, setSavingGeneral] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const [testingWa, setTestingWa] = useState(false)
  const [testingSms, setTestingSms] = useState(false)
  const [pushEnabling, setPushEnabling] = useState(false)
  const [notifToolsOpen, setNotifToolsOpen] = useState(false)
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

  async function saveGeneral() {
    if (!clientId || !settingsHydrated) {
      toast.error('ההגדרות טרם נטענו — רעננו את הדף לפני שמירה')
      return
    }
    setSavingGeneral(true)
    await asyncHandler(
      async () => {
        const payload = {
          manager_phone: managerPhone.trim() || null,
          default_worker_phone: defaultWorkerPhone.trim() || null,
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
    setSavingGeneral(false)
  }

  async function saveNotifications() {
    if (!clientId || !settingsHydrated) {
      toast.error('ההגדרות טרם נטענו — רעננו את הדף לפני שמירה')
      return
    }
    setSavingNotifications(true)
    await asyncHandler(
      async () => {
        const payload = {
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
          <PageHeader title="הגדרות" subtitle="כללי, התראות ווואטסאפ" />
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

            {activeTab === 'general' && (
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
                  <div style={styles.drawerActions}>
                    <LoadingButton
                      variant="primary"
                      onClick={saveGeneral}
                      loading={savingGeneral}
                      loadingText="שומר..."
                    >
                      שמור שינויים
                    </LoadingButton>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'notifications' && (
              <Card noPadding>
                <div style={styles.cardInner}>
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
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>מספר שולח SMS (019) — אופציונלי</label>
                    <input
                      type="tel"
                      value={smsSenderName}
                      onChange={(e) => setSmsSenderName(e.target.value)}
                      style={styles.input}
                      placeholder="05xxxxxxxx או 9725xxxxxxxx"
                      maxLength={15}
                      dir="ltr"
                    />
                    <p style={styles.fieldHint}>
                      019SMS מקבל רק מספר טלפון כשולח (למשל 972559899132). שמות אלפביתיים כמו Bamakor
                      נכשלים בשקט. השאירו ריק לשימוש בשולח ברירת המחדל של המערכת.
                    </p>
                    {smsSenderName.trim() &&
                      !/^(\+?972|0)?5\d{8}$/.test(smsSenderName.replace(/[\s-]/g, '')) && (
                      <p style={{ ...styles.fieldHint, color: theme.colors.warning, fontWeight: 600 }}>
                        נראה שלא מספר ישראלי תקין — לאחר שמירה יישלח עם שולח ברירת המחדל של המערכת
                      </p>
                    )}
                  </div>
                  <CollapsibleSection
                    title="כלים לבדיקה"
                    open={notifToolsOpen}
                    onToggle={() => setNotifToolsOpen((v) => !v)}
                  >
                    <div>
                      <label style={styles.formLabel}>התראות דחיפה (PWA)</label>
                      <p style={styles.formHint}>
                        קבלת התראה כשנפתחת תקלה חדשה. נדרשים מפתחות VAPID בשרת.
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
                    <div>
                      <label style={styles.formLabel}>שליחת מייל (Resend)</label>
                      <p style={styles.formHint}>דורש RESEND_API_KEY בשרת.</p>
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
                  </CollapsibleSection>
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
}
