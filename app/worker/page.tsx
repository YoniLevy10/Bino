'use client'

import dynamic from 'next/dynamic'
import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { toastReporterClosedNotifySummary } from '@/lib/reporter-closed-notify-toast'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  AppShell,
  MobileHeader,
  PageHeader,
  Button,
  Card,
  LoadingSpinner,
  StatusBadge,
  theme,
} from '../components/ui'
import { PageListSkeleton } from '../components/page-skeleton'
import { WorkerInstallPrompt } from '../components/WorkerInstallPrompt'
import type { WorkerAttachment } from '../components/worker/WorkerTicketCard'
import { WorkerPortalToolbar, type WorkerTicketFilter, type WorkerPortalTab } from '../components/worker/WorkerPortalToolbar'

const WorkerTicketCard = dynamic(
  () => import('../components/worker/WorkerTicketCard').then((m) => ({ default: m.WorkerTicketCard })),
  { loading: () => null }
)
const WorkerToursPanel = dynamic(
  () => import('../components/worker/WorkerToursPanel').then((m) => ({ default: m.WorkerToursPanel })),
  { loading: () => null }
)
const TicketWhatsAppThread = dynamic(
  () => import('../components/tickets/TicketWhatsAppThread').then((m) => ({ default: m.TicketWhatsAppThread })),
  { loading: () => <LoadingSpinner /> }
)
import { WorkerPushOnboarding, WorkerPushSync } from '../components/worker/WorkerPushOnboarding'
import { WorkerAttendancePanel } from '../components/worker/WorkerAttendancePanel'
import { AttendanceHelpContact } from '../components/attendance/AttendanceHelpContact'
import { clearWorkerAppBadge, isWorkerPushFullyEnabled, subscribeWorkerPush } from '@/lib/worker-push-client'
import {
  clearWorkerToken,
  normalizeWorkerToken,
  readWorkerToken,
  writeWorkerToken,
} from '@/lib/worker-portal-storage'
import { readWorkerTicketsCache, writeWorkerTicketsCache, filterOpenWorkerTickets } from '@/lib/worker-offline-cache'
import { isTicketInTreatment, WORKER_STATUS_SELECT_OPTIONS, type TicketStatus } from '@/lib/ticket-status'
import { readWorkerDarkMode, workerDarkColors, writeWorkerDarkMode } from '@/lib/worker-theme'

type Worker = { id: string; full_name: string }
type Ticket = {
  id: string
  ticket_number: number
  description: string | null
  status: string
  created_at: string
  priority?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  building_number?: string | null
  project_name?: string | null
  project_address?: string | null
}
type ApiTicketRow = Ticket & {
  projects?: { name?: string | null; address?: string | null; address_en?: string | null } | Array<{
    name?: string | null
    address?: string | null
    address_en?: string | null
  }> | null
}
type ChatMessage = { id: string; sender_name: string; body: string; created_at: string }
type TokenSession = {
  token: string
  workerId: string
  clientId: string
  fullName: string
  workerStampEnabled: boolean
}

function normalizeApiTickets(raw: ApiTicketRow[]): Ticket[] {
  return filterOpenWorkerTickets(
    raw.map((t) => {
      const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
      return {
        id: t.id,
        ticket_number: t.ticket_number,
        description: t.description,
        status: t.status,
        created_at: t.created_at,
        priority: t.priority ?? null,
        reporter_phone: t.reporter_phone ?? null,
        reporter_name: t.reporter_name ?? null,
        building_number: t.building_number ?? null,
        project_name: proj?.name || null,
        project_address: proj?.address || null,
      }
    })
  )
}

function filterWorkerTickets(list: Ticket[], filter: WorkerTicketFilter): Ticket[] {
  if (filter === 'ALL') return list
  if (filter === 'NEW') return list.filter((t) => t.status === 'NEW' || t.status === 'ASSIGNED')
  return list.filter((t) => isTicketInTreatment(t.status))
}

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
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null)
  const [expandedWaId, setExpandedWaId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatBody, setChatBody] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [ticketFilter, setTicketFilter] = useState<WorkerTicketFilter>('ALL')
  const [portalTab, setPortalTab] = useState<WorkerPortalTab>('TICKETS')
  const [toursRefreshKey, setToursRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [usingCache, setUsingCache] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)
  const [attachmentsByTicket, setAttachmentsByTicket] = useState<Record<string, WorkerAttachment[]>>({})
  const [attachmentsLoadingId, setAttachmentsLoadingId] = useState<string | null>(null)
  const [pushEnabling, setPushEnabling] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)

  const palette = darkMode ? workerDarkColors : theme.colors

  useEffect(() => {
    setDarkMode(readWorkerDarkMode())
  }, [])

  useEffect(() => {
    if (!tokenSession) {
      setPushEnabled(false)
      return
    }
    void isWorkerPushFullyEnabled().then(setPushEnabled)
  }, [tokenSession])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void (async () => {
      const fromUrl = searchParams.get('token')?.trim()
      const fromStore = readWorkerToken()
      const token = normalizeWorkerToken(fromUrl) ?? fromStore

      if (fromUrl && token) {
        writeWorkerToken(token)
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
          clearWorkerToken()
          setTokenSession(null)
          setTokenChecked(true)
          return
        }
        const data = (await res.json()) as {
          worker_id?: string
          client_id?: string
          full_name?: string
          worker_stamp_enabled?: boolean
        }
        if (!data.worker_id || !data.client_id) {
          clearWorkerToken()
          setTokenSession(null)
          setTokenChecked(true)
          return
        }
        writeWorkerToken(token)
        setTokenSession({
          token,
          workerId: data.worker_id,
          clientId: data.client_id,
          fullName: data.full_name || '',
          workerStampEnabled: !!data.worker_stamp_enabled,
        })
      } catch {
        clearWorkerToken()
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
      setTickets(filterOpenWorkerTickets((data as Ticket[]) || []))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת תקלות נכשלה')
    } finally { setLoadingTickets(false) }
  }, [clientId])

  const loadTicketsToken = useCallback(async (token: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingTickets(true)
    else setRefreshing(true)
    try {
      const res = await fetchWithTimeout(`/api/worker/tickets?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        const cached = readWorkerTicketsCache()
        if (cached?.tickets?.length) {
          setTickets(normalizeApiTickets(cached.tickets as ApiTicketRow[]))
          setUsingCache(true)
        } else {
          setTickets([])
        }
        return
      }
      const data = (await res.json()) as { tickets?: ApiTicketRow[] }
      const normalized = normalizeApiTickets(data.tickets || [])
      setTickets(normalized)
      writeWorkerTicketsCache(normalized)
      setUsingCache(false)
    } catch {
      const cached = readWorkerTicketsCache()
      if (cached?.tickets?.length) {
        setTickets(normalizeApiTickets(cached.tickets as ApiTicketRow[]))
        setUsingCache(true)
      } else {
        setTickets([])
      }
    } finally {
      if (!opts?.silent) setLoadingTickets(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const onOnline = () => {
      if (tokenSession) void loadTicketsToken(tokenSession.token, { silent: true })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [tokenSession, loadTicketsToken])

  const loadAttachments = useCallback(async (token: string, ticketId: string) => {
    setAttachmentsLoadingId(ticketId)
    try {
      const res = await fetchWithTimeout(
        `/api/worker/attachments?token=${encodeURIComponent(token)}&ticket_id=${encodeURIComponent(ticketId)}`
      )
      if (!res.ok) return
      const data = (await res.json()) as { attachments?: WorkerAttachment[] }
      setAttachmentsByTicket((prev) => ({ ...prev, [ticketId]: data.attachments || [] }))
    } catch {
      /* ignore */
    } finally {
      setAttachmentsLoadingId(null)
    }
  }, [])

  useEffect(() => {
    if (!tokenSession || !activeTicketId) return
    if (attachmentsByTicket[activeTicketId]) return
    void loadAttachments(tokenSession.token, activeTicketId)
  }, [tokenSession, activeTicketId, attachmentsByTicket, loadAttachments])

  useEffect(() => { void loadWorkers() }, [loadWorkers])

  useEffect(() => {
    if (tokenSession) { void loadTicketsToken(tokenSession.token); return }
    void loadTicketsDashboard(workerId)
  }, [workerId, loadTicketsDashboard, tokenSession, loadTicketsToken])

  const selectedName = useMemo(() => {
    if (tokenSession) return tokenSession.fullName
    return workers.find((w) => w.id === workerId)?.full_name || ''
  }, [workers, workerId, tokenSession])

  const openTickets = useMemo(() => filterOpenWorkerTickets(tickets), [tickets])

  const filteredTickets = useMemo(
    () => filterWorkerTickets(openTickets, ticketFilter),
    [openTickets, ticketFilter]
  )

  function removeClosedTicketFromView(ticketId: string) {
    setTickets((prev) => {
      const next = prev.filter((t) => t.id !== ticketId)
      writeWorkerTicketsCache(next)
      return next
    })
    setActiveTicketId((current) => (current === ticketId ? null : current))
    setExpandedChatId((current) => (current === ticketId ? null : current))
    setTranslations((prev) => {
      if (!(ticketId in prev)) return prev
      const next = { ...prev }
      delete next[ticketId]
      return next
    })
    setAttachmentsByTicket((prev) => {
      if (!(ticketId in prev)) return prev
      const next = { ...prev }
      delete next[ticketId]
      return next
    })
  }

  function toggleDarkMode() {
    const next = !darkMode
    setDarkMode(next)
    writeWorkerDarkMode(next)
  }

  function activateTicket(ticketId: string) {
    if (activeTicketId === ticketId) {
      setActiveTicketId(null)
      if (expandedChatId === ticketId) setExpandedChatId(null)
      if (expandedWaId === ticketId) setExpandedWaId(null)
      return
    }
    setActiveTicketId(ticketId)
    if (expandedChatId && expandedChatId !== ticketId) setExpandedChatId(null)
    if (expandedWaId && expandedWaId !== ticketId) setExpandedWaId(null)
  }

  async function confirmCloseTicket() {
    if (!confirmCloseId) return
    const id = confirmCloseId
    setConfirmCloseId(null)
    await setTicketStatus(id, 'CLOSED')
    setActiveTicketId(null)
    setExpandedChatId(null)
  }

  async function enablePush() {
    if (!tokenSession) return
    setPushEnabling(true)
    try {
      const result = await subscribeWorkerPush(tokenSession.token)
      if (result.ok) {
        setPushEnabled(true)
        toast.success('התראות שיבוץ הופעלו')
      } else toast.error(result.error || 'הפעלה נכשלה')
    } finally {
      setPushEnabling(false)
    }
  }

  useEffect(() => {
    if (!tokenSession || loadingTickets) return
    void clearWorkerAppBadge()
  }, [tokenSession, loadingTickets, tickets.length])

  useEffect(() => {
    if (!tokenSession || !('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'WORKER_PUSH_OPEN') {
        void loadTicketsToken(tokenSession.token, { silent: true })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [tokenSession, loadTicketsToken])

  async function openChat(ticketId: string) {
    activateTicket(ticketId)
    if (expandedChatId === ticketId) { setExpandedChatId(null); return }
    setExpandedChatId(ticketId)
    setExpandedWaId(null)
    setChatMessages([])
    setChatBody('')
    if (!tokenSession) return
    setChatLoading(true)
    try {
      const res = await fetchWithTimeout(`/api/worker/chat?token=${encodeURIComponent(tokenSession.token)}&ticket_id=${encodeURIComponent(ticketId)}`)
      if (!res.ok) { setChatMessages([]); return }
      const data = (await res.json()) as { messages?: ChatMessage[] }
      setChatMessages(data.messages || [])
    } catch { setChatMessages([]) }
    finally { setChatLoading(false) }
  }

  function openWa(ticketId: string) {
    activateTicket(ticketId)
    if (expandedWaId === ticketId) {
      setExpandedWaId(null)
      return
    }
    setExpandedWaId(ticketId)
    setExpandedChatId(null)
  }

  async function sendChat(ticketId: string) {
    if (!tokenSession || !chatBody.trim()) return
    setChatSending(true)
    try {
      const res = await fetchWithTimeout('/api/worker/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenSession.token, ticket_id: ticketId, body: chatBody.trim() }),
      })
      if (!res.ok) { toast.error('שליחה נכשלה'); return }
      setChatBody('')
      const refreshRes = await fetchWithTimeout(`/api/worker/chat?token=${encodeURIComponent(tokenSession.token)}&ticket_id=${encodeURIComponent(ticketId)}`)
      if (refreshRes.ok) {
        const data = (await refreshRes.json()) as { messages?: ChatMessage[] }
        setChatMessages(data.messages || [])
      }
    } catch { toast.error('שליחה נכשלה') }
    finally { setChatSending(false) }
  }

  async function translateTicket(ticketId: string, text: string) {
    if (!tokenSession || !text.trim()) return
    setTranslatingId(ticketId)
    try {
      const res = await fetchWithTimeout('/api/worker/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenSession.token, text: text.trim() }),
      })
      const json = (await res.json()) as { translation?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'תרגום נכשל')
      setTranslations((prev) => ({ ...prev, [ticketId]: json.translation || '' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'תרגום נכשל')
    } finally {
      setTranslatingId(null)
    }
  }

  function handleWorkerStatusChange(ticketId: string, status: TicketStatus) {
    if (status === 'CLOSED') {
      setConfirmCloseId(ticketId)
      return
    }
    void setTicketStatus(ticketId, status)
  }

  async function setTicketStatus(ticketId: string, status: TicketStatus) {
    if (tokenSession) {
      setBusyKey(`${ticketId}:${status}`)
      try {
        const res = await fetchWithTimeout('/api/worker/tickets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenSession.token, ticket_id: ticketId, status }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          details?: unknown
          reporter_has_phone?: boolean
          whatsapp_sent?: boolean
        }
        if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
        if (status === 'CLOSED') {
          removeClosedTicketFromView(ticketId)
          toast.success(TM.ticketClosed)
          toastReporterClosedNotifySummary({
            success: true,
            reporter_has_phone: json.reporter_has_phone,
            whatsapp_sent: json.whatsapp_sent,
          })
        } else {
          toast.success(TM.ticketUpdated)
        }
        await loadTicketsToken(tokenSession.token)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
      } finally { setBusyKey(null) }
      return
    }

    if (!clientId) { toast.error('מזהה לקוח לא זמין — התחברו מחדש'); return }
    setBusyKey(`${ticketId}:${status}`)
    try {
      const res = await fetchWithTimeout('/api/update-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, status }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        closed_now?: boolean
        reporter_has_phone?: boolean
        whatsapp_sent?: boolean
      }
      if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
      if (status === 'CLOSED') {
        removeClosedTicketFromView(ticketId)
        toast.success(TM.ticketClosed)
        if (json.closed_now) {
          toastReporterClosedNotifySummary({
            success: true,
            reporter_has_phone: json.reporter_has_phone,
            whatsapp_sent: json.whatsapp_sent,
          })
        }
      } else {
        toast.success(TM.ticketUpdated)
      }
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

  // No token and no admin session → explain personal link (email login disabled)
  if (!tokenSession && !clientId) {
    return (
      <div style={standaloneShell} dir="rtl">
        <div style={styles.standaloneHeader}>
          <h1 style={styles.standaloneTitle}>עובדי שטח (קישור)</h1>
          <p style={styles.standaloneSub}>
            שולחים לכם SMS עם קישור אישי — פתחו אותו מההודעה. אין קישור? בקשו מהמשרד — &quot;שלח קישור ב-SMS&quot; או &quot;העתק קישור&quot; ב«העובדים שלי».
          </p>
        </div>
      </div>
    )
  }

  if (tokenSession) {
    return (
      <div style={{ ...standaloneShell, background: palette.background }} dir="rtl">
        <header style={{ ...styles.standaloneHeader, background: palette.surface, borderColor: palette.border }}>
          <h1 style={{ ...styles.standaloneTitle, color: palette.textPrimary }}>
            שלום {selectedName || 'עובד'}
          </h1>
        </header>

        <WorkerPushOnboarding
          token={tokenSession.token}
          colors={palette}
          openTicketCount={openTickets.length}
          onEnabled={() => setPushEnabled(true)}
        />

        <WorkerPortalToolbar
          colors={palette}
          portalTab={portalTab}
          filter={ticketFilter}
          ticketCount={openTickets.length}
          filteredCount={filteredTickets.length}
          refreshing={refreshing}
          usingCache={usingCache}
          darkMode={darkMode}
          onPortalTabChange={setPortalTab}
          onFilterChange={setTicketFilter}
          onRefresh={() => {
            if (portalTab === 'TOURS') {
              setToursRefreshKey((k) => k + 1)
              return
            }
            if (portalTab === 'ATTENDANCE') return
            void loadTicketsToken(tokenSession.token, { silent: true })
          }}
          onToggleDark={toggleDarkMode}
          onEnablePush={pushEnabled ? undefined : () => void enablePush()}
          pushEnabling={pushEnabling}
          showAttendanceTab={tokenSession.workerStampEnabled}
        />

        <div style={styles.scrollArea}>
          {portalTab === 'ATTENDANCE' ? (
            <>
              <WorkerAttendancePanel
                token={tokenSession.token}
                workerId={tokenSession.workerId}
                colors={palette}
              />
              <div style={{ padding: '0 16px' }}>
                <AttendanceHelpContact />
              </div>
            </>
          ) : portalTab === 'TOURS' ? (
            <WorkerToursPanel
              token={tokenSession.token}
              colors={palette}
              refreshKey={toursRefreshKey}
            />
          ) : loadingTickets ? (
            <div style={styles.center}><LoadingSpinner /></div>
          ) : filteredTickets.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ ...styles.emptyIcon, background: palette.successMuted, color: palette.success }}>✓</div>
              <p style={{ ...styles.emptyText, color: palette.textMuted }}>
                {openTickets.length === 0 ? 'הכל מטופל' : 'אין תקלות בסינון זה'}
              </p>
            </div>
          ) : (
            <div style={styles.tokenTicketList}>
              {filteredTickets.map((t) => (
                <WorkerTicketCard
                  key={t.id}
                  ticket={t}
                  colors={palette}
                  isActive={activeTicketId === t.id}
                  onActivate={() => activateTicket(t.id)}
                  busyKey={busyKey}
                  expandedChat={expandedChatId === t.id}
                  translation={translations[t.id] ?? null}
                  translating={translatingId === t.id}
                  onTranslate={() => void translateTicket(t.id, t.description || '')}
                  onStatusChange={(status) => handleWorkerStatusChange(t.id, status)}
                  onToggleChat={() => void openChat(t.id)}
                  expandedWa={expandedWaId === t.id}
                  onToggleWa={t.reporter_phone ? () => openWa(t.id) : undefined}
                  waSlot={
                    expandedWaId === t.id && t.reporter_phone && tokenSession ? (
                      <TicketWhatsAppThread
                        reporterPhone={t.reporter_phone}
                        ticketId={t.id}
                        mode="worker"
                        workerToken={tokenSession.token}
                      />
                    ) : null
                  }
                  attachments={attachmentsByTicket[t.id]}
                  attachmentsLoading={attachmentsLoadingId === t.id}
                  showAttendanceHint={tokenSession.workerStampEnabled && !!t.project_name}
                  chatSlot={
                    expandedChatId === t.id ? (
                      <div style={styles.officeChatWrap}>
                        <p style={{ ...styles.officeChatBanner, color: palette.textMuted, background: palette.surface }}>
                          הודעה למשרד בלבד — הדייר לא רואה את זה
                        </p>
                        {chatLoading ? (
                          <div style={styles.chatLoading}><LoadingSpinner /></div>
                        ) : chatMessages.length === 0 ? (
                          <p style={{ ...styles.chatEmpty, color: palette.textMuted }}>אין הודעות עדיין — כתבו למטה</p>
                        ) : (
                          <div style={styles.chatMessages}>
                            {chatMessages.map((m) => (
                              <div
                                key={m.id}
                                style={
                                  m.sender_name === tokenSession.fullName
                                    ? { ...styles.chatMine, background: palette.primaryMuted }
                                    : { ...styles.chatOther, background: palette.surface }
                                }
                              >
                                <div style={{ ...styles.chatSender, color: palette.textMuted }}>{m.sender_name}</div>
                                <div style={{ ...styles.chatBody, color: palette.textPrimary }}>{m.body}</div>
                                <div style={{ ...styles.chatTime, color: palette.textMuted }}>
                                  {new Date(m.created_at).toLocaleTimeString('he-IL', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={styles.chatInput}>
                          <textarea
                            value={chatBody}
                            onChange={(e) => setChatBody(e.target.value)}
                            placeholder="כתבו הודעה למשרד…"
                            style={{
                              ...styles.chatTextarea,
                              borderColor: palette.border,
                              background: palette.surface,
                              color: palette.textPrimary,
                            }}
                            rows={3}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void sendChat(t.id)
                              }
                            }}
                          />
                          <Button
                            variant="primary"
                            size="md"
                            loading={chatSending}
                            onClick={() => void sendChat(t.id)}
                          >
                            שלח למשרד
                          </Button>
                        </div>
                      </div>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </div>

        {confirmCloseId ? (
          <div style={{ ...styles.confirmOverlay, background: palette.overlay }}>
            <div style={{ ...styles.confirmBox, background: palette.surface, borderColor: palette.border }}>
              <p style={{ ...styles.confirmText, color: palette.textPrimary }}>סיימתם לטפל בתקלה?</p>
              <p style={{ ...styles.confirmSub, color: palette.textMuted }}>הדייר יקבל הודעה שהתקלה נסגרה</p>
              <div style={styles.confirmActions}>
                <Button variant="secondary" size="md" onClick={() => setConfirmCloseId(null)}>
                  עדיין לא
                </Button>
                <Button variant="primary" size="md" loading={busyKey === `${confirmCloseId}:CLOSED`} onClick={() => void confirmCloseTicket()}>
                  כן, סיימתי
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <WorkerPushSync token={tokenSession.token} onEnabled={() => setPushEnabled(true)} />
        <WorkerInstallPrompt workerName={selectedName || undefined} />
      </div>
    )
  }
  if (!tokenChecked || !sessionResolved) {
    return <PageListSkeleton />
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="עובדי שטח (קישור)" subtitle="שולחים להם SMS עם קישור" />
      )}

      <div style={styles.page}>
        <PageHeader title="עובדי שטח (קישור)" subtitle="שולחים להם SMS עם קישור" />

        {!clientId ? (
          <Card title="אין גישה" noPadding>
            <div style={styles.pad}>
              <p style={styles.muted}>בקשו קישור מהמנהל (העובדים שלי → &quot;העתק קישור&quot;).</p>
            </div>
          </Card>
        ) : (
          <>
            {loadingList ? (
              <div style={styles.center}><LoadingSpinner /></div>
            ) : (
              <Card title="בחר עובד" noPadding style={{ marginBottom: '16px' }}>
                <div style={styles.pad}>
                  <select
                    value={workerId}
                    onChange={(e) => setWorkerId(e.target.value)}
                    style={styles.select}
                    aria-label="בחר עובד"
                  >
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
                  ) : openTickets.length === 0 ? (
                    <p style={styles.muted}>אין תקלות פתוחות משויכות.</p>
                  ) : (
                    <div style={styles.ticketList}>
                      {openTickets.map((t) => (
                        <div key={t.id} style={styles.ticket}>
                          <div style={styles.ticketHead}>
                            <span style={styles.tn}>#{t.ticket_number}</span>
                            <StatusBadge status={t.status} size="sm" />
                          </div>
                          <p style={styles.desc}>{t.description || '—'}</p>
                          <select
                            value={t.status}
                            disabled={!!busyKey}
                            onChange={(e) => handleWorkerStatusChange(t.id, e.target.value as TicketStatus)}
                            style={{ ...styles.select, marginTop: '8px' }}
                            aria-label={`שינוי סטטוס תקלה ${t.ticket_number}`}
                          >
                            {WORKER_STATUS_SELECT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
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
    </AppShell>
  )
}

const standaloneShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  maxHeight: '100dvh',
  overflow: 'hidden',
  background: theme.colors.background,
  paddingTop: 'env(safe-area-inset-top, 0px)',
  boxSizing: 'border-box',
}

const styles: Record<string, CSSProperties> = {
  page: { padding: '24px', maxWidth: '800px' },
  standaloneHeader: {
    flexShrink: 0,
    padding: '12px 14px 8px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '10px 12px calc(88px + env(safe-area-inset-bottom, 0px))',
  },
  standaloneTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: '0 0 2px',
    color: theme.colors.textPrimary,
  },
  standaloneSub: { fontSize: '12px', color: theme.colors.textMuted, margin: 0 },
  center: { padding: '40px', display: 'flex', justifyContent: 'center' },
  pad: { padding: '16px' },
  select: {
    width: '100%', padding: '12px 14px', fontSize: '16px',
    borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface, color: theme.colors.textPrimary,
  },
  muted: { color: theme.colors.textMuted, fontSize: '14px', margin: 0 },
  ticketList: { display: 'flex', flexDirection: 'column', gap: '14px' },
  tokenTicketList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  officeChatWrap: { display: 'flex', flexDirection: 'column', gap: '10px' },
  officeChatBanner: {
    margin: 0,
    padding: '8px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
    textAlign: 'center' as const,
  },
  chatLoading: { display: 'flex', justifyContent: 'center', padding: '12px' },
  chatEmpty: { fontSize: '14px', color: theme.colors.textMuted, margin: 0, textAlign: 'center' as const },
  chatMessages: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: 'min(40vh, 260px)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    marginBottom: '4px',
  },
  chatMine: {
    alignSelf: 'flex-end', background: theme.colors.primaryMuted,
    borderRadius: '12px 12px 4px 12px', padding: '8px 12px', maxWidth: '80%',
  },
  chatOther: {
    alignSelf: 'flex-start', background: theme.colors.muted,
    borderRadius: '12px 12px 12px 4px', padding: '8px 12px', maxWidth: '80%',
  },
  chatSender: { fontSize: '11px', fontWeight: 600, color: theme.colors.textMuted, marginBottom: '3px' },
  chatBody: { fontSize: '14px', color: theme.colors.textPrimary, lineHeight: 1.4 },
  chatTime: { fontSize: '10px', color: theme.colors.textMuted, marginTop: '4px', textAlign: 'end' as const },
  chatInput: { display: 'flex', flexDirection: 'column', gap: '10px' },
  chatTextarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '14px 16px',
    fontSize: '16px',
    borderRadius: '12px',
    border: `2px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    resize: 'none' as const,
    fontFamily: 'inherit',
    lineHeight: 1.45,
    minHeight: '88px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  emptyIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: theme.colors.successMuted,
    color: theme.colors.success,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 700,
  },
  emptyText: { fontSize: '14px', color: theme.colors.textMuted, margin: 0 },
  confirmOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  confirmBox: {
    width: '100%',
    maxWidth: '320px',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    padding: '16px',
  },
  confirmText: { margin: '0 0 8px', fontSize: '17px', fontWeight: 700, textAlign: 'center' as const },
  confirmSub: { margin: '0 0 16px', fontSize: '14px', textAlign: 'center' as const, lineHeight: 1.4 },
  confirmActions: { display: 'flex', gap: '8px', justifyContent: 'center' },
  ticket: {
    padding: '14px', borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`, background: theme.colors.surface,
  },
  ticketHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  tn: { fontWeight: 700, color: theme.colors.primary, fontSize: '15px' },
  desc: { fontSize: '14px', margin: '0 0 8px', lineHeight: 1.5, color: theme.colors.textPrimary },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
}

export default function WorkerPage() {
  return (
    <Suspense fallback={<PageListSkeleton />}>
      <WorkerPageInner />
    </Suspense>
  )
}
