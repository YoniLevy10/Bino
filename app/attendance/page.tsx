'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  Button,
  theme,
} from '../components/ui'
import { PageListSkeleton } from '../components/page-skeleton'
import { PaidAddonGate } from '../components/PaidAddonGate'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

type AttendanceEventRow = {
  id: string
  worker_id: string
  project_id: string | null
  tag_code: string | null
  event_type: string
  client_recorded_at: string
  source: string
  sync_status: string
  sync_delay_minutes: number | null
  suspicious_reason: string | null
  admin_note: string | null
  workers?: { full_name?: string } | { full_name?: string }[] | null
  projects?: { name?: string } | { name?: string }[] | null
}

type NfcTagAdmin = {
  id: string
  tag_code: string
  tag_type: string
  label: string | null
  is_active: boolean
  project_id: string | null
  projects?: { name?: string; project_code?: string } | null
}

const EVENT_LABELS: Record<string, string> = {
  clock_in: 'כניסה',
  clock_out: 'יציאה',
  project_visit: 'ביקור',
  project_arrival: 'הגעה',
  project_departure: 'יציאה מפרויקט',
}

function workerName(row: AttendanceEventRow): string {
  const w = row.workers
  if (!w) return '—'
  if (Array.isArray(w)) return w[0]?.full_name ?? '—'
  return w.full_name ?? '—'
}

function projectName(row: AttendanceEventRow): string {
  if (row.tag_code && !row.project_id) return 'משרד'
  const p = row.projects
  if (!p) return row.tag_code ?? '—'
  if (Array.isArray(p)) return p[0]?.name ?? '—'
  return p.name ?? '—'
}

export default function AttendancePage() {
  const [events, setEvents] = useState<AttendanceEventRow[]>([])
  const [tags, setTags] = useState<NfcTagAdmin[]>([])
  const [kpis, setKpis] = useState({
    active_workers_now: 0,
    clock_ins_today: 0,
    project_visits_today: 0,
    pending_review: 0,
  })
  const [loading, setLoading] = useState(true)
  const [syncFilter, setSyncFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [onboarding, setOnboarding] = useState<{
    scan_url: string
    onboarding_message_he: string
    mode: 'nfc_tag' | 'office_station'
    tag_label: string | null
  } | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const qrRef = useRef<HTMLDivElement>(null)

  const loadOnboarding = useCallback(async () => {
    setOnboardingLoading(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/onboarding-qr')
      const body = (await res.json().catch(() => ({}))) as {
        scan_url?: string
        onboarding_message_he?: string
        mode?: 'nfc_tag' | 'office_station'
        tag_label?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'טעינת QR נכשלה')
      if (body.scan_url && body.onboarding_message_he && body.mode) {
        setOnboarding({
          scan_url: body.scan_url,
          onboarding_message_he: body.onboarding_message_he,
          mode: body.mode,
          tag_label: body.tag_label ?? null,
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת QR נכשלה')
    } finally {
      setOnboardingLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (syncFilter) params.set('sync_status', syncFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      const [evRes, tagRes] = await Promise.all([
        fetchWithTimeout(`/api/attendance/events?${params.toString()}`),
        fetchWithTimeout('/api/attendance/tags'),
      ])
      const evBody = (await evRes.json().catch(() => ({}))) as {
        events?: AttendanceEventRow[]
        kpis?: typeof kpis
        error?: string
      }
      if (!evRes.ok) throw new Error(evBody.error || 'טעינה נכשלה')
      setEvents(evBody.events ?? [])
      if (evBody.kpis) setKpis(evBody.kpis)

      const tagBody = (await tagRes.json().catch(() => ({}))) as { tags?: NfcTagAdmin[]; error?: string }
      if (tagRes.ok) setTags(tagBody.tags ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [syncFilter, sourceFilter])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void load()
    void loadOnboarding()
  }, [load, loadOnboarding])

  async function copyOnboardingMessage() {
    if (!onboarding?.onboarding_message_he) return
    try {
      await navigator.clipboard.writeText(onboarding.onboarding_message_he)
      toast.success('הודעה הועתקה')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  async function copyScanUrl() {
    if (!onboarding?.scan_url) return
    try {
      await navigator.clipboard.writeText(onboarding.scan_url)
      toast.success('קישור הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  function downloadQrPng() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'bamakor-attendance-qr.png'
    a.click()
  }

  async function approveEvent(id: string) {
    setBusyId(id)
    try {
      const res = await fetchWithTimeout('/api/attendance/events/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id, sync_status: 'synced', admin_note: 'אושר ידנית' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'עדכון נכשל')
      toast.success('עודכן')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
    } finally {
      setBusyId(null)
    }
  }

  const inner = (
    <>
      {!isMobile && (
        <PageHeader
          title="חתמת עובדים"
          subtitle="דוח נוכחות — סריקות QR/NFC, משמרות וסנכרון Offline"
        />
      )}

      <div style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.active_workers_now}</div>
          <div style={styles.kpiLabel}>עובדים פעילים עכשיו</div>
        </Card>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.clock_ins_today}</div>
          <div style={styles.kpiLabel}>כניסות היום</div>
        </Card>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.project_visits_today}</div>
          <div style={styles.kpiLabel}>ביקורים בפרויקטים היום</div>
        </Card>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.pending_review}</div>
          <div style={styles.kpiLabel}>ממתינים לבדיקה</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={styles.sectionTitle}>QR לתחילת תיקוף שעות (עד הגעת NFC)</h3>
        <p style={styles.hint}>
          הדפיסו את קוד ה-QR והעבירו לעובדים — עד שמדבקות NFC יגיעו מהמערכת. שלחו גם את הקישור האישי
          ממסך העובדים (פעם אחת, עם אינטרנט).
        </p>
        {onboardingLoading ? (
          <p style={styles.hint}>טוען QR...</p>
        ) : onboarding ? (
          <div style={styles.qrOnboardRow}>
            <div ref={qrRef} style={styles.qrCanvasWrap}>
              <QRCodeCanvas value={onboarding.scan_url} size={168} includeMargin />
            </div>
            <div style={styles.qrOnboardMeta}>
              <p style={styles.scanUrl}>{onboarding.scan_url}</p>
              {onboarding.tag_label ? (
                <p style={styles.hint}>תג: {onboarding.tag_label}</p>
              ) : onboarding.mode === 'office_station' ? (
                <p style={styles.hint}>תחנת משרד — עד שיונפקו תגי שטח</p>
              ) : null}
              <div style={styles.qrBtnRow}>
                <Button variant="secondary" size="sm" onClick={() => void copyScanUrl()}>
                  העתק קישור
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void copyOnboardingMessage()}>
                  העתק הודעה לעובדים
                </Button>
                <Button variant="secondary" size="sm" onClick={downloadQrPng}>
                  הורד QR
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={styles.sectionTitle}>תגי QR / NFC</h3>
        <p style={styles.hint}>
          מדבקות QR מונפקות על ידי צוות במקור. לבקשת תגים חדשים או להדפסת QR — פנו לתמיכה.
          עובדים סורקים לאחר פתיחה חד-פעמית של האזור האישי עם אינטרנט.
        </p>
        {tags.length === 0 ? (
          <p style={styles.hint}>אין תגים רשומים לחשבון.</p>
        ) : (
          <ul style={styles.tagList}>
            {tags.map((t) => (
              <li key={t.id} style={styles.tagItem}>
                <strong>{t.tag_code}</strong> · {t.tag_type === 'office' ? 'משרד' : 'פרויקט'}
                {t.label ? ` · ${t.label}` : ''}
                {!t.is_active ? ' (מושבת)' : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div style={styles.filters}>
          <select
            style={styles.input}
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value)}
          >
            <option value="">כל הסטטוסים</option>
            <option value="synced">סונכרן</option>
            <option value="pending_review">ממתין לבדיקה</option>
            <option value="conflict">קונפליקט</option>
            <option value="rejected">נדחה</option>
          </select>
          <select
            style={styles.input}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">כל המקורות</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            רענון
          </Button>
        </div>

        {loading ? (
          <PageListSkeleton rows={6} />
        ) : events.length === 0 ? (
          <p style={styles.hint}>אין אירועים להצגה</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>עובד</th>
                  <th style={styles.th}>סוג</th>
                  <th style={styles.th}>מיקום</th>
                  <th style={styles.th}>זמן</th>
                  <th style={styles.th}>מקור</th>
                  <th style={styles.th}>סנכרון</th>
                  <th style={styles.th}>עיכוב</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{workerName(row)}</td>
                    <td style={styles.td}>{EVENT_LABELS[row.event_type] ?? row.event_type}</td>
                    <td style={styles.td}>{projectName(row)}</td>
                    <td style={styles.td}>
                      {new Date(row.client_recorded_at).toLocaleString('he-IL')}
                    </td>
                    <td style={styles.td}>
                      <span style={badge(row.source === 'online' ? theme.colors.primary : theme.colors.warning)}>
                        {row.source === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={badge(syncBadgeColor(row.sync_status))}>{row.sync_status}</span>
                      {row.suspicious_reason ? (
                        <div style={{ fontSize: 11, color: theme.colors.error }}>{row.suspicious_reason}</div>
                      ) : null}
                    </td>
                    <td style={styles.td}>
                      {row.sync_delay_minutes != null ? `${row.sync_delay_minutes} דק׳` : '—'}
                    </td>
                    <td style={styles.td}>
                      {row.sync_status === 'pending_review' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busyId === row.id}
                          onClick={() => void approveEvent(row.id)}
                        >
                          אשר
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={PAID_ADDON_KEYS.worker_stamp}>
        {isMobile && (
          <MobileHeader
            title="חתמת עובדים"
            subtitle="נוכחות ומשמרות"
            onMenuClick={() => setMenuOpen(true)}
          />
        )}
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div
          style={{
            padding: isMobile ? '16px 16px 32px' : '32px 40px',
            maxWidth: isMobile ? '100%' : 1200,
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {inner}
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

function syncBadgeColor(status: string): string {
  if (status === 'synced') return theme.colors.success
  if (status === 'pending_review') return theme.colors.warning
  if (status === 'conflict') return theme.colors.error
  return theme.colors.textMuted
}

function badge(bg: string): CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 6,
    background: bg,
    color: '#fff',
    fontWeight: 600,
  }
}

const styles: Record<string, CSSProperties> = {
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: { padding: 16, textAlign: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 700, color: theme.colors.textPrimary },
  kpiLabel: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 13, color: theme.colors.textMuted },
  tagFormRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    minWidth: 120,
    flex: 1,
  },
  scanUrl: { fontSize: 12, wordBreak: 'break-all', marginBottom: 8, direction: 'ltr', textAlign: 'left' },
  qrOnboardRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'flex-start',
  },
  qrCanvasWrap: {
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: '#fff',
  },
  qrOnboardMeta: { flex: 1, minWidth: 200 },
  qrBtnRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tagList: { margin: 0, paddingRight: 20, fontSize: 13 },
  tagItem: { marginBottom: 4 },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'right',
    padding: '8px 10px',
    borderBottom: `2px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
  },
  td: {
    padding: '10px',
    borderBottom: `1px solid ${theme.colors.border}`,
    verticalAlign: 'top',
  },
}
