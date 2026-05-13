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
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  Button,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageListSkeleton } from '../components/page-skeleton'

type ClientRow = {
  id: string
  whatsapp_business_phone?: string | null
  manager_phone?: string | null
  default_worker_phone?: string | null
  sms_on_ticket_open?: boolean | null
  sms_on_ticket_close?: boolean | null
  whatsapp_phone_number_id?: string | null
  whatsapp_access_token?: string | null
  sms_sender_name?: string | null
}

const TABS = [
  { id: 'notifications', label: 'התראות' },
  { id: 'whatsapp', label: 'וואטסאפ / הטמעה' },
  { id: 'team', label: 'גישת צוות' },
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
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TabId | null
  const activeTab: TabId =
    tabFromUrl && TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'notifications'

  function goTab(id: TabId) {
    router.replace(`/settings?tab=${encodeURIComponent(id)}`, { scroll: false })
    if (id === 'team') void loadTeam()
  }

  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [clientId, setClientId] = useState<string>('')
  const [client, setClient] = useState<ClientRow | null>(null)

  const [managerPhone, setManagerPhone] = useState('')
  const [defaultWorkerPhone, setDefaultWorkerPhone] = useState('')
  const [smsSenderName, setSmsSenderName] = useState('')
  const [smsOnOpen, setSmsOnOpen] = useState(true)
  const [smsOnClose, setSmsOnClose] = useState(true)

  const [waBusinessPhone, setWaBusinessPhone] = useState('')
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waAccessToken, setWaAccessToken] = useState('')
  const [waTokenLoaded, setWaTokenLoaded] = useState(false)

  const [savingNotifications, setSavingNotifications] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const [testingWa, setTestingWa] = useState(false)
  const [testingSms, setTestingSms] = useState(false)
  const [pushEnabling, setPushEnabling] = useState(false)

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
    await asyncHandler(
      async () => {
        const resolvedClientId = await resolveBamakorClientIdForBrowser()

        const { data: row, error: cErr } = await supabase
          .from('clients')
          .select(
            'id, whatsapp_business_phone, manager_phone, default_worker_phone, sms_on_ticket_open, sms_on_ticket_close, whatsapp_phone_number_id, whatsapp_access_token, sms_sender_name'
          )
          .eq('id', resolvedClientId)
          .maybeSingle()

        if (cErr) throw cErr
        if (!row?.id) throw new Error('לא נמצא רשומת לקוח')

        setClientId(row.id)
        setClient(row)

        setManagerPhone(row.manager_phone || '')
        setDefaultWorkerPhone(row.default_worker_phone || '')
        setSmsSenderName(row.sms_sender_name || '')
        setSmsOnOpen(row.sms_on_ticket_open !== false)
        setSmsOnClose(row.sms_on_ticket_close !== false)

        setWaBusinessPhone(row.whatsapp_business_phone || '')
        setWaPhoneNumberId(row.whatsapp_phone_number_id || '')
        setWaAccessToken(row.whatsapp_access_token || '')
        setWaTokenLoaded(true)

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
    if (!clientId) return
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
        const res = await fetchWithTimeout('/api/settings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
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
        const res = await fetchWithTimeout('/api/settings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
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

  async function testSms() {
    setTestingSms(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/settings/test-sms', { method: 'POST' })
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
        const res = await fetchWithTimeout('/api/settings/test-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
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
          onMenuClick={() => setMenuOpen(true)}
        />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {isMobile && (
        <div style={{ padding: '0 16px 12px', maxWidth: '100%', boxSizing: 'border-box' }}>
          <Link href="/billing" style={styles.headerSecondaryLink}>
            חיוב ושימוש
          </Link>
        </div>
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
          <PageHeader
            title="הגדרות"
            subtitle="התראות ווואטסאפ"
            actions={
              <Link href="/billing" style={styles.headerSecondaryLink}>
                חיוב ושימוש
              </Link>
            }
          />
        )}

        <p style={{ margin: '0 0 16px', fontSize: '14px', color: theme.colors.textMuted }}>
          <Link href="/privacy">מדיניות פרטיות</Link> · קובץ התבניה המלא בתיקיית הריפו{' '}
          <code>PRIVACY_POLICY_TEMPLATE.md</code>
        </p>

        {loading ? (
          <div style={styles.loadingContainer}>
            <PageListSkeleton rows={5} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <LoadingSpinner size="lg" />
            </div>
          </div>
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
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void enablePushNotifications()}
                      loading={pushEnabling}
                    >
                      הפעל התראות
                    </Button>
                  </div>
                  <div style={styles.drawerActions}>
                    <Button variant="secondary" type="button" onClick={testSms} loading={testingSms}>
                      בדוק SMS
                    </Button>
                    <Button variant="primary" onClick={saveNotifications} loading={savingNotifications}>
                      שמור שינויים
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'whatsapp' && (
              <Card noPadding>
                <div style={styles.cardInner}>
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
                      placeholder={waTokenLoaded && client?.whatsapp_access_token ? 'הזינו טוקן חדש להחלפה' : 'הדביקו טוקן ארוך-טווח'}
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
                    <Button variant="secondary" type="button" onClick={testWhatsapp} loading={testingWa}>
                      בדוק חיבור
                    </Button>
                    <Button variant="primary" onClick={saveWhatsapp} loading={savingWhatsapp}>
                      שמור שינויים
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'team' && (
              <Card noPadding>
                <div style={styles.cardInner}>
                  <div style={{ fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
                    הזמינו עובדים לראות תקלות במערכת. הם יקבלו מייל עם קישור כניסה וייראו את כל התקלות של הלקוח.
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="כתובת מייל של העובד"
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
