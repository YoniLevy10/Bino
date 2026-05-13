'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Button,
  Card,
  LoadingSpinner,
  StatusBadge,
  theme,
  MobileBottomNav,
} from '../components/ui'
import { PageListSkeleton } from '../components/page-skeleton'

const WORKER_TOKEN_KEY = 'bamakor_worker_token'

type Worker = { id: string; full_name: string }
type Ticket = {
  id: string
  ticket_number: number
  description: string | null
  status: string
  created_at: string
}
type TokenSession = { token: string; workerId: string; clientId: string; fullName: string }

function WorkerPageInner() {
  const searchParams = useSearchParams()
  const [tokenSession, setTokenSession] = useState<TokenSession | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [sessionResolved, setSessionResolved] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workerId, setWorkerId] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void (async () => {
      const fromUrl = searchParams.get('token')?.trim()
      const fromStore = typeof window !== 'undefined' ? sessionStorage.getItem(WORKER_TOKEN_KEY) : null
      const raw = fromUrl || fromStore || ''
      const token = /^[a-f0-9-]{36}$/i.test(raw) ? raw.toLowerCase() : ''

      if (fromUrl && token) {
        sessionStorage.setItem(WORKER_TOKEN_KEY, token)
        window.history.replaceState(null, '', '/worker')
      }

      if (!token) {
        setTokenSession(null)
        setTokenChecked(true)
        return
      }

      try {
        const res = await fetchWithTimeout(`/api/worker-auth?token=${encodeURIComponent(token)}`)
        if (!res.ok) {
          sessionStorage.removeItem(WORKER_TOKEN_KEY)
          setTokenSession(null)
          setTokenChecked(true)
          return
        }
        const data = (await res.json()) as { worker_id?: string; client_id?: string; full_name?: string }
        if (!data.worker_id || !data.client_id) {
          sessionStorage.removeItem(WORKER_TOKEN_KEY)
          setTokenSession(null)
          setTokenChecked(true)
          return
        }
        setTokenSession({ token, workerId: data.worker_id, clientId: data.client_id, fullName: data.full_name || '' })
      } catch {
        sessionStorage.removeItem(WORKER_TOKEN_KEY)
        setTokenSession(null)
      } finally {
        setTokenChecked(true)
      }
    })()
  }, [searchParams])

  useEffect(() => {
    if (tokenSession) { setSessionResolved(true); return }
    void (async () => {
      try { setClientId(await resolveBamakorClientIdForBrowser()) }
      catch { setClientId(null) }
      finally { setSessionResolved(true) }
    })()
  }, [tokenSession])

  const loadWorkers = useCallback(async () => {
    if (!clientId) { setWorkers([]); setLoadingList(false); return }
    setLoadingList(true)
    try {
      const { data, error } = await supabase
        .from('workers').select('id, full_name')
        .eq('client_id', clientId).eq('is_active', true).is('deleted_at', null).order('full_name')
      if (error) throw error
      setWorkers((data as Worker[]) || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת עובדים נכשלה')
    } finally { setLoadingList(false) }
  }, [clientId])

  const loadTicketsDashboard = useCallback(async (wid: string) => {
    if (!wid || !clientId) { setTickets([]); return }
    setLoadingTickets(true)
    try {
      const { data, error } = await supabase
        .from('tickets').select('id, ticket_number, description, status, created_at')
        .eq('client_id', clientId).eq('assigned_worker_id', wid)
        .is('deleted_at', null).neq('status', 'CLOSED').order('created_at', { ascending: false })
      if (error) throw error
      setTickets((data as Ticket[]) || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת תקלות נכשלה')
    } finally { setLoadingTickets(false) }
  }, [clientId])

  const loadTicketsToken = useCallback(async (token: string) => {
    setLoadingTickets(true)
    try {
      const res = await fetchWithTimeout(`/api/worker/tickets?token=${encodeURIComponent(token)}`)
      if (!res.ok) { setTickets([]); return }
      const data = (await res.json()) as { tickets?: Ticket[] }
      setTickets(data.tickets || [])
    } catch { setTickets([]) }
    finally { setLoadingTickets(false) }
  }, [])

  useEffect(() => { void loadWorkers() }, [loadWorkers])

  useEffect(() => {
    if (tokenSession) { void loadTicketsToken(tokenSession.token); return }
    void loadTicketsDashboard(workerId)
  }, [workerId, loadTicketsDashboard, tokenSession, loadTicketsToken])

  const selectedName = useMemo(() => {
    if (tokenSession) return tokenSession.fullName
    return workers.find((w) => w.id === workerId)?.full_name || ''
  }, [workers, workerId, tokenSession])

  async function loginByEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = emailInput.trim()
    if (!email) return
    setEmailLoading(true)
    setEmailError('')
    try {
      const res = await fetchWithTimeout('/api/worker-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json()) as { token?: string; worker_id?: string; client_id?: string; full_name?: string; error?: string }
      if (!res.ok || !data.token) {
        setEmailError(data.error || 'לא נמצא עובד עם אימייל זה')
        return
      }
      sessionStorage.setItem(WORKER_TOKEN_KEY, data.token)
      setTokenSession({ token: data.token, workerId: data.worker_id!, clientId: data.client_id!, fullName: data.full_name || '' })
    } catch {
      setEmailError('שגיאת חיבור — נסה שוב')
    } finally {
      setEmailLoading(false)
    }
  }

  async function setTicketStatus(ticketId: string, status: 'IN_PROGRESS' | 'CLOSED') {
    if (tokenSession) {
      setBusyKey(`${ticketId}:${status}`)
      try {
        const res = await fetchWithTimeout('/api/worker/tickets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenSession.token, ticket_id: ticketId, status }),
        })
        if (!res.ok) throw new Error('עדכון נכשל')
        toast.success(status === 'CLOSED' ? TM.ticketClosed : TM.ticketUpdated)
        await loadTicketsToken(tokenSession.token)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
      } finally { setBusyKey(null) }
      return
    }

    if (!clientId) { toast.error('מזהה לקוח לא זמין — התחברו מחדש'); return }
    setBusyKey(`${ticketId}:${status}`)
    try {
      const payload: Record<string, string | null> = { status }
      if (status === 'CLOSED') payload.closed_at = new Date().toISOString()
      else payload.closed_at = null
      const { error } = await supabase.from('tickets').update(payload)
        .eq('id', ticketId).eq('client_id', clientId).is('deleted_at', null)
      if (error) throw error
      toast.success(status === 'CLOSED' ? TM.ticketClosed : TM.ticketUpdated)
      await loadTicketsDashboard(workerId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
    } finally { setBusyKey(null) }
  }

  // Standalone worker view (accessed via token link or email login — no sidebar)
  if (!tokenChecked || !sessionResolved) {
    return (
      <div style={standaloneShell} dir="rtl">
        <div style={styles.center}><LoadingSpinner /></div>
      </div>
    )
  }

  // No token and no admin clientId → show email login or "no access"
  if (!tokenSession && !clientId) {
    return (
      <div style={standaloneShell} dir="rtl">
        <div style={styles.standaloneHeader}>
          <h1 style={styles.standaloneTitle}>כניסת עובד</h1>
          <p style={styles.standaloneSub}>הזינו את האימייל שלכם כדי לראות את התקלות שלכם</p>
        </div>
        <form onSubmit={(e) => void loginByEmail(e)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="your@email.com"
            required
            dir="ltr"
            style={styles.emailInput}
          />
          {emailError && <p style={styles.emailError}>{emailError}</p>}
          <Button variant="primary" type="submit" loading={emailLoading}>
            כניסה
          </Button>
          <p style={{ fontSize: '13px', color: theme.colors.textMuted, textAlign: 'center', margin: 0 }}>
            אין לכם אימייל במערכת? בקשו מהמנהל קישור גישה אישי.
          </p>
        </form>
      </div>
    )
  }

  if (tokenSession) {
    return (
      <div style={standaloneShell} dir="rtl">
        <div style={styles.standaloneHeader}>
          <h1 style={styles.standaloneTitle}>שלום, {selectedName || 'עובד'}</h1>
          <p style={styles.standaloneSub}>תקלות פתוחות המשויכות אליך</p>
        </div>

        {loadingTickets ? (
          <div style={styles.center}><LoadingSpinner /></div>
        ) : tickets.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>✓</div>
            <p style={styles.emptyText}>אין תקלות פתוחות כרגע</p>
          </div>
        ) : (
          <div style={styles.tokenTicketList}>
            {tickets.map((t) => (
              <div key={t.id} style={styles.tokenTicket}>
                <div style={styles.ticketHead}>
                  <span style={styles.tn}>#{t.ticket_number}</span>
                  <StatusBadge status={t.status} size="sm" />
                </div>
                <p style={styles.desc}>{t.description || '—'}</p>
                <div style={styles.actions}>
                  <Button variant="secondary" size="sm"
                    disabled={!!busyKey} loading={busyKey === `${t.id}:IN_PROGRESS`}
                    onClick={() => setTicketStatus(t.id, 'IN_PROGRESS')}>
                    בטיפול
                  </Button>
                  <Button variant="primary" size="sm"
                    disabled={!!busyKey} loading={busyKey === `${t.id}:CLOSED`}
                    onClick={() => setTicketStatus(t.id, 'CLOSED')}>
                    הושלם
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Admin dashboard view: uses AppShell like all other admin pages
  if (!tokenChecked || !sessionResolved) {
    return <PageListSkeleton />
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="מסך עובד" onMenuClick={() => setMenuOpen(true)} />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.page}>
        <PageHeader title="מסך עובד" subtitle="בחרו עובד ועדכנו תקלות פתוחות" />

        {!clientId ? (
          <Card title="אין גישה" noPadding>
            <div style={styles.pad}>
              <p style={styles.muted}>בקש קישור מהמנהל (מסך עובדים → &quot;העתק קישור&quot;).</p>
            </div>
          </Card>
        ) : (
          <>
            {loadingList ? (
              <div style={styles.center}><LoadingSpinner /></div>
            ) : (
              <Card title="בחר עובד" noPadding style={{ marginBottom: '16px' }}>
                <div style={styles.pad}>
                  <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} style={styles.select}>
                    <option value="">בחרו עובד…</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>{w.full_name}</option>
                    ))}
                  </select>
                </div>
              </Card>
            )}

            {workerId && (
              <Card title={`תקלות פתוחות — ${selectedName}`} noPadding>
                <div style={styles.pad}>
                  {loadingTickets ? (
                    <div style={styles.center}><LoadingSpinner /></div>
                  ) : tickets.length === 0 ? (
                    <p style={styles.muted}>אין תקלות פתוחות משויכות.</p>
                  ) : (
                    <div style={styles.ticketList}>
                      {tickets.map((t) => (
                        <div key={t.id} style={styles.ticket}>
                          <div style={styles.ticketHead}>
                            <span style={styles.tn}>#{t.ticket_number}</span>
                            <StatusBadge status={t.status} size="sm" />
                          </div>
                          <p style={styles.desc}>{t.description || '—'}</p>
                          <div style={styles.actions}>
                            <Button variant="secondary" size="sm"
                              disabled={!!busyKey} loading={busyKey === `${t.id}:IN_PROGRESS`}
                              onClick={() => setTicketStatus(t.id, 'IN_PROGRESS')}>
                              בטיפול
                            </Button>
                            <Button variant="primary" size="sm"
                              disabled={!!busyKey} loading={busyKey === `${t.id}:CLOSED`}
                              onClick={() => setTicketStatus(t.id, 'CLOSED')}>
                              הושלם
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {isMobile && <MobileBottomNav />}
    </AppShell>
  )
}

const standaloneShell: CSSProperties = {
  minHeight: '100vh',
  background: theme.colors.background,
  padding: '24px 16px calc(32px + env(safe-area-inset-bottom, 0px))',
  paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
  boxSizing: 'border-box',
}

const styles: Record<string, CSSProperties> = {
  page: { padding: '24px', maxWidth: '800px' },
  standaloneHeader: { marginBottom: '24px' },
  standaloneTitle: {
    fontSize: '24px', fontWeight: 700, margin: '0 0 6px',
    color: theme.colors.textPrimary,
  },
  standaloneSub: { fontSize: '14px', color: theme.colors.textMuted, margin: 0 },
  center: { padding: '40px', display: 'flex', justifyContent: 'center' },
  pad: { padding: '16px' },
  select: {
    width: '100%', padding: '12px 14px', fontSize: '16px',
    borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface, color: theme.colors.textPrimary,
  },
  muted: { color: theme.colors.textMuted, fontSize: '14px', margin: 0 },
  ticketList: { display: 'flex', flexDirection: 'column', gap: '14px' },
  tokenTicketList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  ticket: {
    padding: '14px', borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`, background: theme.colors.surface,
  },
  tokenTicket: {
    padding: '16px', borderRadius: '14px',
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  ticketHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  tn: { fontWeight: 700, color: theme.colors.primary, fontSize: '15px' },
  desc: { fontSize: '14px', margin: '0 0 14px', lineHeight: 1.5, color: theme.colors.textPrimary },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  emailInput: {
    width: '100%', padding: '14px 16px', fontSize: '16px',
    borderRadius: '12px', border: `1.5px solid ${theme.colors.border}`,
    background: theme.colors.surface, color: theme.colors.textPrimary,
    boxSizing: 'border-box' as const,
  },
  emailError: {
    fontSize: '13px', color: theme.colors.error, margin: 0,
    padding: '8px 12px', background: theme.colors.errorMuted,
    borderRadius: '8px',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
  },
  emptyIcon: {
    width: '56px', height: '56px', borderRadius: '50%',
    background: theme.colors.successMuted, color: theme.colors.success,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: 700,
  },
  emptyText: { fontSize: '16px', color: theme.colors.textMuted, margin: 0 },
}

export default function WorkerPage() {
  return (
    <Suspense fallback={<PageListSkeleton />}>
      <WorkerPageInner />
    </Suspense>
  )
}
