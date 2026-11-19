'use client'

/**
 * Per-building collections bank match — file import + match queue.
 * Gated by BANK_MATCH_POC_ENABLED (API returns 503 when off).
 * When projectId is omitted (finance/bank page), shows an inline building select
 * next to this section — not at the top of the page.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
} from '@/lib/shared/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/errors/error-handler'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { useTenantProjectsList } from '@/lib/hooks/use-projects-list'
import { Button, LoadingSpinner, Select, theme } from '@/app/components/ui'

const BANK_IMPORT_FETCH_TIMEOUT_MS = 5 * 60_000
const LAST_PROJECT_STORAGE_KEY = 'last_addon_project_id'

type Props = {
  /** When set (Hub), lock to this building — no picker. */
  projectId?: string | null
  projectName?: string | null
  isMobile?: boolean
}

type TxRow = {
  id: string
  amount: number
  booked_at: string | null
  description: string | null
  reference: string | null
  match_status: string
  matched_charge_id: string | null
  suggested_charge_id: string | null
  match_confidence: string | null
  direction: string
}

type ChargeRow = {
  id: string
  amount: number
  status: string
  period_label: string | null
  payment_reference: string | null
  bank_transaction_id: string | null
  residents?:
    | { full_name?: string; apartment_number?: string }
    | { full_name?: string; apartment_number?: string }[]
    | null
}

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

function residentLabel(c: ChargeRow): string {
  const r = Array.isArray(c.residents) ? c.residents[0] : c.residents
  if (!r) return c.payment_reference || 'חיוב'
  const apt = r.apartment_number ? `דירה ${r.apartment_number}` : ''
  return [r.full_name, apt].filter(Boolean).join(' · ') || 'חיוב'
}

function readStoredProjectId(): string | null {
  try {
    return sessionStorage.getItem(LAST_PROJECT_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

function writeStoredProjectId(id: string) {
  try {
    sessionStorage.setItem(LAST_PROJECT_STORAGE_KEY, id)
  } catch {
    // ignore
  }
}

/** Hub / locked building — no page-level picker. */
export function BuildingBankMatchPanel(props: Props) {
  if (props.projectId) {
    return (
      <BuildingBankMatchBody
        projectId={props.projectId}
        projectName={props.projectName}
        isMobile={props.isMobile}
        showPicker={false}
        projects={[]}
        onPickBuilding={() => {}}
      />
    )
  }
  return <BuildingBankMatchPanelWithPicker isMobile={props.isMobile} />
}

function BuildingBankMatchPanelWithPicker({ isMobile }: { isMobile?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const projectFromUrl = searchParams.get('project')?.trim() ?? ''

  const {
    projects: projectRows,
    isLoading: projectsLoading,
    hasData: projectsHasData,
  } = useTenantProjectsList({ activeOnly: true })

  const projects = useMemo(
    () =>
      projectRows.map((p) => ({
        id: p.id,
        name: p.name,
      })),
    [projectRows]
  )

  const [pickedId, setPickedId] = useState('')
  const didUrlSync = useRef(false)

  useEffect(() => {
    if (projects.length === 0) return
    setPickedId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev
      if (projectFromUrl && projects.some((p) => p.id === projectFromUrl)) {
        return projectFromUrl
      }
      const stored = readStoredProjectId()
      if (stored && projects.some((p) => p.id === stored)) return stored
      return projects[0]?.id ?? ''
    })
  }, [projects, projectFromUrl])

  useEffect(() => {
    if (!pickedId || didUrlSync.current) return
    didUrlSync.current = true
    writeStoredProjectId(pickedId)
    if (projectFromUrl !== pickedId) {
      router.replace(`${pathname}?project=${encodeURIComponent(pickedId)}`, {
        scroll: false,
      })
    }
  }, [pickedId, pathname, projectFromUrl, router])

  useEffect(() => {
    if (!projectFromUrl || projects.length === 0) return
    if (!projects.some((p) => p.id === projectFromUrl)) return
    setPickedId((prev) => (prev === projectFromUrl ? prev : projectFromUrl))
    writeStoredProjectId(projectFromUrl)
  }, [projectFromUrl, projects])

  function handlePickBuilding(id: string) {
    setPickedId(id)
    writeStoredProjectId(id)
    router.replace(`${pathname}?project=${encodeURIComponent(id)}`, { scroll: false })
  }

  if (projectsLoading && !projectsHasData) {
    return (
      <div style={{ marginTop: 28, paddingTop: 24, display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div
        dir="rtl"
        style={{
          marginTop: 28,
          paddingTop: 24,
          borderTop: `1px solid ${theme.colors.border}`,
          fontSize: 13,
          color: theme.colors.textMuted,
        }}
      >
        אין בניינים פעילים — הוסיפו בניין בדף פרויקטים.
      </div>
    )
  }

  if (!pickedId) return null

  return (
    <BuildingBankMatchBody
      projectId={pickedId}
      projectName={projects.find((p) => p.id === pickedId)?.name}
      isMobile={isMobile}
      showPicker
      projects={projects}
      onPickBuilding={handlePickBuilding}
    />
  )
}

function BuildingBankMatchBody({
  projectId,
  projectName,
  isMobile: isMobileProp,
  showPicker,
  projects,
  onPickBuilding,
}: {
  projectId: string
  projectName?: string | null
  isMobile?: boolean
  showPicker: boolean
  projects: Array<{ id: string; name: string }>
  onPickBuilding: (id: string) => void
}) {
  const [isMobile, setIsMobile] = useState(Boolean(isMobileProp))
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    paid_matched: 0,
    open_debt: 0,
    awaiting_match: 0,
  })
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [csvBusy, setCsvBusy] = useState(false)

  useEffect(() => {
    if (isMobileProp !== undefined) {
      setIsMobile(isMobileProp)
      return
    }
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const matchRes = await fetchWithTimeout(
        `/api/building-finance/bank-match/match?project_id=${encodeURIComponent(projectId)}`
      )

      if (matchRes.status === 503) {
        setEnabled(false)
        return
      }
      setEnabled(true)

      const matchJson = (await matchRes.json().catch(() => ({}))) as {
        summary?: typeof summary
        transactions?: TxRow[]
        charges?: ChargeRow[]
      }
      if (matchRes.ok) {
        if (matchJson.summary) setSummary(matchJson.summary)
        setTransactions(matchJson.transactions || [])
        setCharges(matchJson.charges || [])
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function onImportFile(file: File) {
    if (!projectId) return
    setCsvBusy(true)
    try {
      const lower = file.name.toLowerCase()
      const isText =
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv') ||
        lower.endsWith('.txt') ||
        file.type.startsWith('text/')

      let body: Record<string, unknown>
      if (isText) {
        body = {
          project_id: projectId,
          csv_text: await file.text(),
          file_name: file.name,
          mime_type: file.type || undefined,
          run_match: true,
        }
      } else {
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        body = {
          project_id: projectId,
          file_base64: btoa(binary),
          file_name: file.name,
          mime_type: file.type || undefined,
          run_match: true,
        }
      }

      const res = await fetchWithTimeout(
        '/api/building-finance/bank-match/import-csv',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        BANK_IMPORT_FETCH_TIMEOUT_MS
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'ייבוא נכשל'))
        return
      }
      const parsed = Number((json as { parsed?: number }).parsed || 0)
      const format = String((json as { format?: string }).format || '')
      toast.success(`יובאו ${parsed} תנועות${format ? ` (${format})` : ''} — הורצה התאמה`)
      await load()
    } finally {
      setCsvBusy(false)
    }
  }

  async function matchAction(body: Record<string, unknown>) {
    const res = await fetchWithTimeout(
      '/api/building-finance/bank-match/match',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(errorMessageFromResponseJson(json, 'פעולה נכשלה'))
      return
    }
    toast.success('עודכן')
    await load()
  }

  async function sendReminders() {
    if (!projectId) return
    const res = await fetchWithTimeout(
      '/api/building-finance/bank-match/reminders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    const json = (await res.json().catch(() => ({}))) as {
      sent?: number
      skipped?: number
      error?: string
    }
    if (!res.ok) {
      toast.error(errorMessageFromResponseJson(json, 'שליחת תזכורות נכשלה'))
      return
    }
    toast.success(`נשלחו ${json.sent || 0} תזכורות (דולגו ${json.skipped || 0})`)
  }

  const s = styles(isMobile)

  if (enabled === false) {
    return null
  }

  if (loading && enabled === null) {
    return (
      <div style={s.wrap}>
        <LoadingSpinner />
      </div>
    )
  }

  const queue = transactions.filter((t) =>
    ['unmatched', 'suggested', 'unmatched_after_revoke'].includes(t.match_status)
  )
  const chargeById = new Map(charges.map((c) => [c.id, c]))

  return (
    <div style={s.wrap} dir="rtl">
      <div style={s.header}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={s.kicker}>גבייה · התאמות בנק</p>
          <h3 style={s.title}>{projectName || 'בניין'}</h3>
          <p style={s.statusLine}>
            ייבאו קובץ תנועות מהבנק (CSV / Excel / PDF) והתאימו לחיובים.
          </p>
        </div>
        <div style={s.headerActions}>
          {showPicker ? (
            <label style={s.pickField}>
              <span style={s.pickLabel}>בניין</span>
              <Select
                value={projectId}
                onChange={onPickBuilding}
                options={projects.map((p) => ({
                  label: p.name,
                  value: p.id,
                }))}
                style={{
                  minWidth: isMobile ? 0 : 200,
                  width: isMobile ? '100%' : 240,
                  minHeight: isMobile ? 44 : undefined,
                }}
              />
            </label>
          ) : null}
          <label style={s.fileBtn}>
            {csvBusy ? 'מייבא…' : 'ייבוא קובץ (CSV / Excel / PDF)'}
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              disabled={csvBusy}
              onChange={(ev) => {
                const f = ev.target.files?.[0]
                if (f) void onImportFile(f)
                ev.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div style={s.stats}>
        <div style={s.stat}>
          <span style={s.statValue}>{summary.paid_matched}</span>
          <span style={s.statLabel}>שולם</span>
        </div>
        <div style={s.stat}>
          <span style={s.statValue}>{summary.open_debt}</span>
          <span style={s.statLabel}>חוב פתוח</span>
        </div>
        <div style={s.stat}>
          <span style={s.statValue}>{summary.awaiting_match}</span>
          <span style={s.statLabel}>ממתין להתאמה</span>
        </div>
      </div>

      <div style={s.actionsRow}>
        <Button
          type="button"
          onClick={() =>
            void matchAction({ action: 'run_pass', project_id: projectId })
          }
        >
          הרץ התאמה מחדש
        </Button>
        <Button type="button" onClick={() => void sendReminders()}>
          שלח תזכורות לפער
        </Button>
      </div>

      <p style={s.panelTitle}>תור אישור ידני</p>
      {queue.length === 0 ? (
        <p style={s.muted}>אין תנועות ממתינות — ייבאו קובץ בנק להתחלה.</p>
      ) : (
        <ul style={s.queue}>
          {queue.map((t) => {
            const suggested = t.suggested_charge_id
              ? chargeById.get(t.suggested_charge_id)
              : null
            return (
              <li key={t.id} style={s.queueItem}>
                <div style={s.queueMain}>
                  <span style={s.queueAmount}>{formatIls(t.amount)}</span>
                  <span style={s.queueDesc}>
                    {t.description || t.reference || 'תנועה'}
                    {t.booked_at ? ` · ${t.booked_at}` : ''}
                  </span>
                  {suggested ? (
                    <span style={s.suggest}>
                      מוצע: {residentLabel(suggested)} · {formatIls(suggested.amount)}
                      {suggested.payment_reference
                        ? ` · ${suggested.payment_reference}`
                        : ''}
                    </span>
                  ) : (
                    <span style={s.suggest}>אין הצעה חד־משמעית — בחרו חיוב</span>
                  )}
                </div>
                <div style={s.queueActions}>
                  {suggested ? (
                    <button
                      type="button"
                      style={s.primaryBtn}
                      onClick={() =>
                        void matchAction({
                          action: 'apply',
                          project_id: projectId,
                          transaction_id: t.id,
                          charge_id: suggested.id,
                        })
                      }
                    >
                      אשר
                    </button>
                  ) : null}
                  <select
                    style={s.select}
                    defaultValue=""
                    onChange={(ev) => {
                      const chargeId = ev.target.value
                      if (!chargeId) return
                      void matchAction({
                        action: 'apply',
                        project_id: projectId,
                        transaction_id: t.id,
                        charge_id: chargeId,
                      })
                    }}
                  >
                    <option value="">שייך לחיוב…</option>
                    {charges
                      .filter((c) => c.status === 'sent' || c.status === 'draft')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {residentLabel(c)} · {formatIls(c.amount)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    style={s.textBtn}
                    onClick={() =>
                      void matchAction({
                        action: 'suggest_ignore',
                        project_id: projectId,
                        transaction_id: t.id,
                      })
                    }
                  >
                    התעלם
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {transactions.some((t) => t.match_status === 'matched_charge') ? (
        <>
          <p style={s.panelTitle}>מותאמים לאחרונה</p>
          <ul style={s.queue}>
            {transactions
              .filter((t) => t.match_status === 'matched_charge')
              .slice(0, 8)
              .map((t) => (
                <li key={t.id} style={s.queueItem}>
                  <div style={s.queueMain}>
                    <span style={s.queueAmount}>{formatIls(t.amount)}</span>
                    <span style={s.queueDesc}>{t.description || 'מותאם'}</span>
                  </div>
                  <button
                    type="button"
                    style={s.textBtn}
                    onClick={() =>
                      void matchAction({
                        action: 'unmatch',
                        project_id: projectId,
                        transaction_id: t.id,
                      })
                    }
                  >
                    בטל התאמה
                  </button>
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function styles(isMobile: boolean): Record<string, CSSProperties> {
  return {
    wrap: {
      marginTop: 28,
      paddingTop: 24,
      borderTop: `1px solid ${theme.colors.border}`,
      direction: 'rtl',
    },
    header: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: isMobile ? 'stretch' : 'flex-start',
    },
    headerActions: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'flex-end',
    },
    pickField: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: isMobile ? '100%' : 200,
    },
    pickLabel: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    kicker: {
      margin: 0,
      fontSize: 12,
      color: theme.colors.textMuted,
      letterSpacing: '0.04em',
    },
    title: {
      margin: '4px 0 0',
      fontSize: isMobile ? 20 : 22,
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    statusLine: {
      margin: '8px 0 0',
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 1.45,
    },
    panelTitle: {
      margin: '18px 0 8px',
      fontSize: 15,
      fontWeight: 650,
      color: theme.colors.textPrimary,
    },
    muted: {
      margin: '0 0 12px',
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 1.45,
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: isMobile ? 8 : 14,
      marginTop: 18,
    },
    stat: {
      padding: isMobile ? '12px 8px' : '16px 12px',
      textAlign: 'center',
      borderBottom: `2px solid ${theme.colors.border}`,
    },
    statValue: {
      display: 'block',
      fontSize: isMobile ? 22 : 28,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: theme.colors.textPrimary,
    },
    statLabel: {
      display: 'block',
      marginTop: 4,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    actionsRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 16,
    },
    fileBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '8px 14px',
      borderRadius: 8,
      border: `1px solid ${theme.colors.border}`,
      fontSize: 13,
      cursor: 'pointer',
      background: theme.colors.surface,
      color: theme.colors.textPrimary,
      minHeight: isMobile ? 44 : undefined,
      boxSizing: 'border-box',
    },
    queue: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    queueItem: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      justifyContent: 'space-between',
      gap: 10,
      padding: '12px 0',
      borderBottom: `1px solid ${theme.colors.border}`,
    },
    queueMain: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
      flex: 1,
    },
    queueAmount: {
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      fontSize: 16,
    },
    queueDesc: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    suggest: {
      fontSize: 13,
      color: theme.colors.textPrimary,
    },
    queueActions: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    primaryBtn: {
      padding: '8px 14px',
      borderRadius: 8,
      border: 'none',
      background: theme.colors.primary,
      color: theme.colors.textInverse,
      fontSize: 13,
      fontFamily: 'inherit',
      cursor: 'pointer',
    },
    textBtn: {
      border: 'none',
      background: 'transparent',
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: 'inherit',
      cursor: 'pointer',
      textDecoration: 'underline',
    },
    select: {
      maxWidth: isMobile ? '100%' : 220,
      padding: '8px 10px',
      borderRadius: 8,
      border: `1px solid ${theme.colors.border}`,
      fontFamily: 'inherit',
      fontSize: 13,
      background: theme.colors.background,
    },
  }
}
