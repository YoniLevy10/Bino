'use client'

/**
 * Client-level bank OS — business account for the whole tenant (not per building).
 * Visual: balance hero + ledger, BINO manager palette.
 * Financy: connections health, AIS ledger, hosted PIS payUrl, books/clearing.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import {
  fetchWithTimeout,
  LONG_RUNNING_FETCH_TIMEOUT_MS,
  MUTATION_FETCH_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'
import { FinancyConnectCard } from '@/app/components/finance/FinancyConnectCard'
import {
  bankAccountKindLabelHe,
  isFinancyCardAccountType,
  isFinancyCashAccountType,
} from '@/lib/bank/financy-gateway'
import type { BankPanelSection } from '@/lib/bank/types'

type Props = {
  projectId?: string | null
  projectName?: string | null
  isMobile?: boolean
}

type AccountRow = {
  id: string
  display_name: string | null
  account_type: string | null
  balance: number | null
  currency: string
  synced_at: string
}

type TxRow = {
  id: string
  amount: number
  currency: string
  booked_at: string | null
  description: string | null
  merchant_name: string | null
  category_main: string | null
  match_status: string
}

type TransferRow = {
  id: string
  amount: number
  currency: string
  description: string | null
  payee_name: string | null
  status: string
  pay_url: string | null
  created_at: string
}

type ConnectionRow = {
  id: string
  providerId?: string | null
  status?: string | null
  accounts?: number | null
  expiryDate?: string | null
  consentExpiresAt?: string | null
  lastFetchedDataDate?: string | null
  lastFetchedAt?: string | null
  dataThrough?: string | null
  connectionOwnerName?: string | null
}

type MerchantRow = {
  id: string
  name?: string | null
  displayName?: string | null
  iban?: string | null
  bban?: string | null
}

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

/** Financy receivables amounts are minor units (agorot). */
function formatMinorIls(minor: number): string {
  return formatIls(minor / 100)
}

function formatSyncedAt(iso: string | undefined | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function connectionFreshness(c: ConnectionRow): string | null {
  return c.lastFetchedDataDate || c.lastFetchedAt || c.dataThrough || null
}

function connectionExpiry(c: ConnectionRow): string | null {
  return c.expiryDate || c.consentExpiresAt || null
}

function isConnectionHealthy(status: string | null | undefined): boolean {
  const s = (status || '').toUpperCase()
  return s === 'ACTIVE' || s === 'CONNECTED' || s === 'COMPLETED'
}

const SECTION_LABELS: { id: BankPanelSection; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'transactions', label: 'תנועות' },
  { id: 'transfers', label: 'העברות' },
  { id: 'books', label: 'ספרים' },
  { id: 'clearing', label: 'סליקה' },
]

const STATUS_HE: Record<string, string> = {
  created: 'נוצר',
  pending_bank: 'ממתין לאישור בנק',
  succeeded: 'הצליח',
  failed: 'נכשל',
  canceled: 'בוטל',
  unmatched: 'לא מותאם',
  matched_charge: 'מותאם לגבייה',
  matched_expense: 'מותאם להוצאה',
  ignored: 'התעלמות',
}

const CONN_STATUS_HE: Record<string, string> = {
  ACTIVE: 'פעיל',
  CONNECTED: 'מחובר',
  COMPLETED: 'הושלם (חד־פעמי)',
  FETCHING: 'מושך נתונים…',
  INACTIVE: 'לא פעיל',
  EXPIRED: 'פג תוקף',
  REVOKED: 'בוטל',
  ERROR: 'שגיאה',
  FETCHING_ERROR: 'שגיאת משיכה',
  CREDENTIALS_ERROR: 'שגיאת התחברות',
  PARTIALLY_AUTHORIZED: 'הרשאה חלקית',
}

function merchantLabel(m: MerchantRow): string {
  return String(m.displayName || m.name || m.id)
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

function clearingAmountLabel(row: Record<string, unknown>): string | null {
  const amounts =
    row.amounts && typeof row.amounts === 'object'
      ? (row.amounts as Record<string, unknown>)
      : null
  if (typeof amounts?.netMinor === 'number') return formatMinorIls(amounts.netMinor)
  if (typeof amounts?.grossMinor === 'number') return formatMinorIls(amounts.grossMinor)
  if (typeof row.amountMinor === 'number') return formatMinorIls(row.amountMinor)
  if (typeof row.amount === 'number') return formatIls(row.amount)
  return null
}

function isClearingIntegrationRow(row: Record<string, unknown>): boolean {
  const cat = String(row.category || '').toLowerCase()
  if (cat === 'clearing') return true
  const hay = [row.provider, row.connectorId, row.connectorName, row.id, row.label]
    .map((v) => String(v || '').toLowerCase())
    .join(' ')
  return /isracard|pelecard|clearing/.test(hay)
}

function integrationLabel(row: Record<string, unknown>): string {
  return String(
    row.label || row.connectorName || row.provider || row.connectorId || row.category || row.id || 'integration'
  )
}

export function BuildingBankPanel({ isMobile: isMobileProp }: Props) {
  const [isMobile, setIsMobile] = useState(Boolean(isMobileProp))
  const [section, setSection] = useState<BankPanelSection>('overview')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [connectionsError, setConnectionsError] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<MerchantRow[]>([])
  const [books, setBooks] = useState<Record<string, unknown> | null>(null)
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('')
  const [merchantId, setMerchantId] = useState('')
  const [transferForm, setTransferForm] = useState({
    amount: '',
    payee_name: '',
    payee_account: '',
    description: '',
  })
  const [creatingTransfer, setCreatingTransfer] = useState(false)
  const [savingMerchant, setSavingMerchant] = useState(false)

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

  const loadCore = useCallback(async () => {
    setLoading(true)
    try {
      const [stRes, accRes, txRes] = await Promise.all([
        fetchWithTimeout('/api/building-finance/bank/status'),
        fetchWithTimeout('/api/building-finance/bank/accounts?limit=50'),
        fetchWithTimeout('/api/building-finance/bank/transactions?limit=50'),
      ])
      const st = (await stRes.json().catch(() => ({}))) as Record<string, unknown>
      if (stRes.ok) {
        setConfigured(st.configured === true)
        setEnabled(st.enabled === true)
        if (st.flags && typeof st.flags === 'object') {
          setFlags(st.flags as Record<string, boolean>)
        }
        setConnections(asRecordArray(st.connections) as ConnectionRow[])
        setConnectionsError(
          typeof st.connections_error === 'string' ? st.connections_error : null
        )
      }
      if (accRes.ok) {
        const j = (await accRes.json()) as { accounts?: AccountRow[] }
        setAccounts(j.accounts || [])
      }
      if (txRes.ok) {
        const j = (await txRes.json()) as { transactions?: TxRow[] }
        setTransactions(j.transactions || [])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת חשבון בנק נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTransfers = useCallback(async () => {
    if (flags.transfers === false) return
    const res = await fetchWithTimeout('/api/building-finance/bank/transfers?limit=50')
    if (!res.ok) return
    const j = (await res.json()) as {
      transfers?: TransferRow[]
      merchants?: MerchantRow[]
    }
    setTransfers(j.transfers || [])
    if (Array.isArray(j.merchants)) setMerchants(j.merchants)
  }, [flags.transfers])

  const loadBooks = useCallback(
    async (integrationId?: string) => {
      if (flags.books === false) return
      const q = integrationId
        ? `?integration_id=${encodeURIComponent(integrationId)}`
        : ''
      const res = await fetchWithTimeout(
        `/api/building-finance/bank/books${q}`,
        {},
        LONG_RUNNING_FETCH_TIMEOUT_MS
      )
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        setBooks({ error: errorMessageFromResponseJson(j, 'שגיאה') })
        return
      }
      setBooks(j)
      if (typeof j.selected_integration_id === 'string' && j.selected_integration_id) {
        setSelectedIntegrationId((prev) => prev || String(j.selected_integration_id))
      }
    },
    [flags.books]
  )

  useEffect(() => {
    void loadCore()
  }, [loadCore])

  useEffect(() => {
    if (section === 'transfers') void loadTransfers()
  }, [section, loadTransfers])

  useEffect(() => {
    if (section === 'books' || section === 'clearing') {
      void loadBooks(selectedIntegrationId || undefined)
    }
  }, [section, selectedIntegrationId, loadBooks])

  // After hosted PIS redirect (?transfer=return), open transfers and refresh pending.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('transfer') !== 'return') return
    // Strip immediately so Strict Mode / flag updates don't double-poll.
    params.delete('transfer')
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
    window.history.replaceState({}, '', next)
    setSection('transfers')
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/building-finance/bank/transfers?limit=50')
        if (res.ok) {
          const j = (await res.json()) as {
            transfers?: TransferRow[]
            merchants?: MerchantRow[]
          }
          const list = j.transfers || []
          setTransfers(list)
          if (Array.isArray(j.merchants)) setMerchants(j.merchants)
          const pending = list.filter(
            (t) => t.status === 'pending_bank' || t.status === 'created'
          )
          for (const t of pending.slice(0, 5)) {
            await fetchWithTimeout(
              '/api/building-finance/bank/transfers',
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transfer_id: t.id }),
              },
              MUTATION_FETCH_TIMEOUT_MS
            )
          }
          await loadTransfers()
        }
        toast.success('חזרתם מאישור הבנק — סטטוס עודכן')
      } catch {
        /* ignore — user can refresh status manually */
      }
    })()
  }, [loadTransfers])

  async function onSync(refresh = false) {
    setSyncing(true)
    try {
      const res = await fetchWithTimeout(
        '/api/building-finance/bank/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: null, refresh }),
        },
        LONG_RUNNING_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'סנכרון נכשל'))
        return
      }
      const syncMsg = `סונכרן: ${json.accountsUpserted ?? 0} חשבונות, ${json.transactionsUpserted ?? 0} תנועות`
      const refreshInfo = json.refresh as { status?: string; error?: string } | null
      if (refresh && refreshInfo && typeof refreshInfo === 'object' && 'error' in refreshInfo) {
        toast.error(`רענון בנק: ${String(refreshInfo.error)} · ${syncMsg}`)
      } else if (refresh && refreshInfo && typeof refreshInfo === 'object') {
        const st = String(refreshInfo.status || 'accepted')
        toast.success(
          st === 'already_running'
            ? `רענון כבר רץ ב־Financy · ${syncMsg}`
            : `רענון בנק נשלח · ${syncMsg}`
        )
      } else {
        toast.success(syncMsg)
      }
      await loadCore()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSyncing(false)
    }
  }

  async function onMatchTx(id: string, match_status: 'ignored' | 'unmatched') {
    const res = await fetchWithTimeout(
      '/api/building-finance/bank/transactions',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: id, match_status }),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(errorMessageFromResponseJson(j, 'שגיאה'))
      return
    }
    toast.success(match_status === 'ignored' ? 'התנועה סומנה כהתעלמות' : 'ההתעלמות בוטלה')
    await loadCore()
  }

  async function onCreateTransfer(e: FormEvent) {
    e.preventDefault()
    const amount = Number(transferForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('סכום לא תקין')
      return
    }
    if (!merchantId && (!transferForm.payee_name || !transferForm.payee_account)) {
      toast.error('בחרו מוטב שמור או הזינו שם + מספר חשבון')
      return
    }
    setCreatingTransfer(true)
    try {
      const res = await fetchWithTimeout(
        '/api/building-finance/bank/transfers',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: null,
            amount,
            merchant_id: merchantId || undefined,
            payee_name: merchantId ? undefined : transferForm.payee_name || undefined,
            payee_account: merchantId ? undefined : transferForm.payee_account || undefined,
            description: transferForm.description || undefined,
            allow_business: true,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'יצירת העברה נכשלה'))
        return
      }
      const payUrl = typeof json.pay_url === 'string' ? json.pay_url : null
      toast.success('העברה נוצרה — אשרו בבנק דרך Financy')
      if (payUrl) window.open(payUrl, '_blank', 'noopener,noreferrer')
      setTransferForm({ amount: '', payee_name: '', payee_account: '', description: '' })
      await loadTransfers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setCreatingTransfer(false)
    }
  }

  async function onSaveMerchant() {
    if (!transferForm.payee_name || !transferForm.payee_account) {
      toast.error('שם מוטב ומספר חשבון נדרשים לשמירה')
      return
    }
    setSavingMerchant(true)
    try {
      const account = transferForm.payee_account.replace(/\s+/g, '')
      const isIban = /^IL/i.test(account) || account.length >= 20
      const res = await fetchWithTimeout(
        '/api/building-finance/bank/merchants',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: transferForm.payee_name,
            display_name: transferForm.payee_name,
            ...(isIban ? { iban: account } : { bban: account }),
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        toast.error(errorMessageFromResponseJson(json, 'שמירת מוטב נכשלה'))
        return
      }
      const m = json.merchant as { id?: string } | undefined
      toast.success('מוטב נשמר ב־Financy')
      await loadTransfers()
      if (m?.id) setMerchantId(String(m.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSavingMerchant(false)
    }
  }

  async function refreshTransfer(id: string) {
    const res = await fetchWithTimeout(
      '/api/building-finance/bank/transfers',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer_id: id }),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(errorMessageFromResponseJson(json, 'שגיאה'))
      return
    }
    toast.success('סטטוס עודכן')
    await loadTransfers()
  }

  const receivablesRec =
    books?.receivables && typeof books.receivables === 'object'
      ? (books.receivables as Record<string, unknown>)
      : null
  const receivablesCustomers = asRecordArray(receivablesRec?.customers)
  const receivablesByCurrency = asRecordArray(receivablesRec?.byCurrency)

  const visibleSections = SECTION_LABELS.filter((tab) => {
    if (tab.id === 'transfers' && flags.transfers === false) return false
    if (tab.id === 'books' && flags.books === false) return false
    if (tab.id === 'clearing' && flags.clearing === false) return false
    return true
  })

  const s = styles(isMobile, visibleSections.length)

  if (loading) {
    return (
      <div style={s.loadingWrap}>
        <LoadingSpinner />
      </div>
    )
  }

  if (!enabled || !configured) {
    return (
      <div style={s.wrap}>
        <div style={s.connectHero}>
          <p style={s.connectEyebrow}>חשבון עסקי · BINO</p>
          <h2 style={s.connectTitle}>חברו את חשבון הבנק של העסק</h2>
          <p style={s.connectLead}>
            חיבור אחד לכל הבניינים — יתרות, תנועות, העברות וספרים דרך Financy.
          </p>
        </div>
        <FinancyConnectCard compact isMobile={isMobile} onConnected={() => void loadCore()} />
        <p style={s.mutedCenter}>
          <Link href="/settings?tab=financy" style={s.inlineLink}>
            או מהגדרות → Financy
          </Link>
        </p>
      </div>
    )
  }

  const cashAccounts = accounts.filter((a) => isFinancyCashAccountType(a.account_type))
  const cardAccounts = accounts.filter((a) => isFinancyCardAccountType(a.account_type))
  /** Cash-only total — card balances are liability / charge, not business cash. */
  const totalBalance = cashAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
  const lastSynced = accounts.reduce<string | undefined>((best, a) => {
    if (!a.synced_at) return best
    if (!best || a.synced_at > best) return a.synced_at
    return best
  }, undefined)
  const unmatchedCount = transactions.filter((t) => t.match_status === 'unmatched').length
  const healthyConnections = connections.filter((c) => isConnectionHealthy(c.status)).length

  const integrations = asRecordArray(books?.integrations)
  const clearingIntegrations = integrations.filter(isClearingIntegrationRow)
  const booksIntegrations = integrations.filter((i) => !isClearingIntegrationRow(i))
  const documents = asRecordArray(books?.documents)
  const bookCustomers = asRecordArray(books?.customers)
  const proposals = asRecordArray(books?.proposals)
  const clearing = (books?.clearing as Record<string, unknown> | null) || null
  const settlements = clearing ? asRecordArray(clearing.settlements) : []
  const cardTx = clearing ? asRecordArray(clearing.card_transactions) : []
  const clearingIntegrationId =
    typeof clearing?.integration_id === 'string' ? clearing.integration_id : null
  const selectorIntegrations =
    section === 'clearing'
      ? clearingIntegrations.length > 0
        ? clearingIntegrations
        : integrations
      : booksIntegrations.length > 0
        ? booksIntegrations
        : integrations

  const accountMetaParts: string[] = []
  if (cashAccounts.length > 0) accountMetaParts.push(`${cashAccounts.length} חשבונות מזומן`)
  if (cardAccounts.length > 0) accountMetaParts.push(`${cardAccounts.length} כרטיסים`)
  if (accountMetaParts.length === 0 && accounts.length > 0) {
    accountMetaParts.push(`${accounts.length} חשבונות`)
  }

  return (
    <div style={s.wrap}>
      <section style={s.hero} aria-label="יתרת מזומן בחשבון העסק">
        <div style={s.heroTop}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={s.heroEyebrow}>חשבון בנק כללי · כל הבניינים</p>
            <p style={s.heroLabel}>יתרת מזומן (עו״ש / חיסכון)</p>
            <p style={s.heroBalance} className="bank-hero-balance">
              {formatIls(totalBalance)}
            </p>
            <p style={s.heroMeta}>
              {accountMetaParts.join(' · ')}
              {connections.length > 0
                ? ` · ${healthyConnections}/${connections.length} חיבורי בנק תקינים`
                : ''}
              {lastSynced ? ` · עודכן ${formatSyncedAt(lastSynced)}` : ''}
              {unmatchedCount > 0 ? ` · ${unmatchedCount} תנועות להתאמה` : ''}
            </p>
          </div>
          <div style={s.heroActions}>
            <Button
              type="button"
              disabled={syncing}
              onClick={() => void onSync(false)}
              style={isMobile ? { width: '100%', minHeight: 48 } : undefined}
            >
              {syncing ? 'מסנכרן…' : 'סנכרון'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={syncing}
              onClick={() => void onSync(true)}
              style={isMobile ? { width: '100%', minHeight: 48 } : undefined}
            >
              רענון בנק
            </Button>
          </div>
        </div>

        {accounts.length > 0 ? (
          <div style={s.accountStrip} role="list">
            {accounts.map((a) => {
              const isCard = isFinancyCardAccountType(a.account_type)
              return (
                <div
                  key={a.id}
                  role="listitem"
                  style={isCard ? { ...s.accountChip, ...s.accountChipCard } : s.accountChip}
                >
                  <span style={isCard ? s.accountKindCard : s.accountKind}>
                    {bankAccountKindLabelHe(a.account_type)}
                  </span>
                  <span style={s.accountName}>{a.display_name || a.account_type || 'חשבון'}</span>
                  <span style={isCard ? s.accountBalCard : s.accountBal}>
                    {a.balance != null ? formatIls(Number(a.balance)) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={s.heroEmpty}>אין חשבונות עדיין — לחצו סנכרון אחרי חיבור ב־Financy.</p>
        )}
      </section>

      <div style={s.tabs} role="tablist" aria-label="מסך בנק">
        {visibleSections.map((tab) => {
          const active = section === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              style={{ ...s.tab, ...(active ? s.tabActive : null) }}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div style={s.panel}>
        {section === 'overview' && (
          <div style={s.overviewGrid}>
            <div style={s.statTile}>
              <span style={s.statLabel}>חשבונות</span>
              <span style={s.statValue}>{accounts.length}</span>
            </div>
            <div style={s.statTile}>
              <span style={s.statLabel}>תנועות אחרונות</span>
              <span style={s.statValue}>{transactions.length}</span>
            </div>
            <div style={s.statTile}>
              <span style={s.statLabel}>ממתינות להתאמה</span>
              <span
                style={{
                  ...s.statValue,
                  color: unmatchedCount > 0 ? theme.colors.warning : theme.colors.success,
                }}
              >
                {unmatchedCount}
              </span>
            </div>

            <div style={s.fullBleed}>
              <p style={s.panelTitle}>בריאות חיבורי בנק</p>
              {connectionsError ? (
                <p style={s.emptyState}>{connectionsError}</p>
              ) : connections.length === 0 ? (
                <p style={s.emptyState}>
                  אין חיבורים — חברו בנק ב־{' '}
                  <a
                    href="https://financy.open-finance.ai/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={s.inlineLink}
                  >
                    Financy Settings
                  </a>
                  .
                </p>
              ) : (
                <ul style={s.ledger}>
                  {connections.map((c) => {
                    const healthy = isConnectionHealthy(c.status)
                    const statusKey = String(c.status || '').toUpperCase()
                    return (
                      <li key={c.id} style={s.ledgerRow}>
                        <div style={s.ledgerMain}>
                          <span style={s.ledgerTitle}>
                            {c.providerId || 'בנק'}
                            {c.connectionOwnerName ? ` · ${c.connectionOwnerName}` : ''}
                          </span>
                          <span style={s.ledgerSub}>
                            רענון אחרון: {formatSyncedAt(connectionFreshness(c))}
                            {connectionExpiry(c)
                              ? ` · תוקף הסכמה: ${formatSyncedAt(connectionExpiry(c))}`
                              : ''}
                            {typeof c.accounts === 'number' ? ` · ${c.accounts} חשבונות` : ''}
                          </span>
                        </div>
                        <span
                          style={{
                            ...s.statusPill,
                            background: healthy
                              ? theme.colors.successMuted
                              : theme.colors.warningMuted,
                            color: healthy ? theme.colors.success : theme.colors.warning,
                          }}
                        >
                          {CONN_STATUS_HE[statusKey] || c.status || 'לא ידוע'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div style={s.quickLinks}>
              <p style={s.panelTitle}>קיצורי דרך</p>
              <div style={s.linkRow}>
                <Link href="/finance" style={s.pillLink}>
                  הכנסות והוצאות
                </Link>
                <Link href="/finance/reports" style={s.pillLink}>
                  דוחות
                </Link>
                <Link href="/collections" style={s.pillLink}>
                  גבייה
                </Link>
              </div>
              <p style={s.muted}>
                התאמת תנועות לגבייה/הוצאה מקצרת זמן עד פתרון ומורידה התערבות מנהל.
              </p>
            </div>
          </div>
        )}

        {section === 'transactions' && (
          <div>
            <div style={s.panelHead}>
              <p style={s.panelTitle}>יומן תנועות</p>
              <p style={s.muted}>{transactions.length} רשומות</p>
            </div>
            {transactions.length === 0 ? (
              <p style={s.emptyState}>אין תנועות מסונכרנות עדיין.</p>
            ) : (
              <ul style={s.ledger}>
                {transactions.map((t) => (
                  <li key={t.id} style={s.ledgerRow}>
                    <div style={s.ledgerMain}>
                      <span style={s.ledgerTitle}>
                        {t.merchant_name || t.description || 'תנועה'}
                      </span>
                      <span style={s.ledgerSub}>
                        {t.booked_at || '—'} · {t.category_main || 'ללא קטגוריה'} ·{' '}
                        {STATUS_HE[t.match_status] || t.match_status}
                      </span>
                    </div>
                    <div style={s.ledgerAside}>
                      <span
                        style={{
                          ...s.ledgerAmount,
                          color:
                            t.amount < 0 ? theme.colors.kpiNegative : theme.colors.kpiPositive,
                        }}
                      >
                        {formatIls(t.amount)}
                      </span>
                      {t.match_status === 'unmatched' ? (
                        <button
                          type="button"
                          style={s.textBtn}
                          onClick={() => void onMatchTx(t.id, 'ignored')}
                        >
                          התעלם
                        </button>
                      ) : null}
                      {t.match_status === 'ignored' ? (
                        <button
                          type="button"
                          style={s.textBtn}
                          onClick={() => void onMatchTx(t.id, 'unmatched')}
                        >
                          בטל התעלמות
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section === 'transfers' && (
          <div style={s.transferLayout}>
            <form onSubmit={onCreateTransfer} style={s.transferForm}>
              <p style={s.panelTitle}>העברה חדשה</p>
              <p style={s.muted}>
                Financy יוצר תשלום PIS ומחזיר קישור אישור בבנק (payUrl). אחרי האישור חזרו לכאן
                לרענון סטטוס.
              </p>
              <label style={s.field}>
                מוטב שמור
                <select
                  style={s.input}
                  value={merchantId}
                  onChange={(ev) => setMerchantId(ev.target.value)}
                >
                  <option value="">— הזנה ידנית —</option>
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      {merchantLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={s.field}>
                סכום
                <input
                  style={s.input}
                  value={transferForm.amount}
                  onChange={(ev) => setTransferForm((f) => ({ ...f, amount: ev.target.value }))}
                  inputMode="decimal"
                  required
                />
              </label>
              {!merchantId ? (
                <>
                  <label style={s.field}>
                    שם מוטב
                    <input
                      style={s.input}
                      value={transferForm.payee_name}
                      onChange={(ev) =>
                        setTransferForm((f) => ({ ...f, payee_name: ev.target.value }))
                      }
                    />
                  </label>
                  <label style={s.field}>
                    מספר חשבון מוטב (IBAN / BBAN)
                    <input
                      style={s.input}
                      value={transferForm.payee_account}
                      onChange={(ev) =>
                        setTransferForm((f) => ({ ...f, payee_account: ev.target.value }))
                      }
                      dir="ltr"
                    />
                  </label>
                  <button
                    type="button"
                    style={s.textBtn}
                    disabled={savingMerchant}
                    onClick={() => void onSaveMerchant()}
                  >
                    {savingMerchant ? 'שומר מוטב…' : 'שמור כמוטב ב־Financy'}
                  </button>
                </>
              ) : null}
              <label style={s.field}>
                תיאור / אסמכתא
                <input
                  style={s.input}
                  value={transferForm.description}
                  onChange={(ev) =>
                    setTransferForm((f) => ({ ...f, description: ev.target.value }))
                  }
                />
              </label>
              <Button type="submit" disabled={creatingTransfer}>
                {creatingTransfer ? 'יוצר…' : 'צור העברה ואשר בבנק'}
              </Button>
            </form>

            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={s.panelTitle}>יומן העברות</p>
              {transfers.length === 0 ? (
                <p style={s.emptyState}>עדיין אין העברות.</p>
              ) : (
                <ul style={s.ledger}>
                  {transfers.map((t) => (
                    <li key={t.id} style={s.ledgerRow}>
                      <div style={s.ledgerMain}>
                        <span style={s.ledgerTitle}>
                          {t.payee_name || t.description || 'העברה'}
                        </span>
                        <span style={s.ledgerSub}>
                          {STATUS_HE[t.status] || t.status} · {formatSyncedAt(t.created_at)}
                        </span>
                      </div>
                      <div style={s.ledgerAside}>
                        <span style={s.ledgerAmount}>{formatIls(t.amount)}</span>
                        {t.pay_url &&
                        (t.status === 'pending_bank' || t.status === 'created') ? (
                          <a
                            href={t.pay_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={s.inlineLink}
                          >
                            המשך אישור בבנק
                          </a>
                        ) : null}
                        <button
                          type="button"
                          style={s.textBtn}
                          onClick={() => void refreshTransfer(t.id)}
                        >
                          רענון סטטוס
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {(section === 'books' || section === 'clearing') && (
          <div>
            {books && typeof books.error === 'string' ? (
              <p style={s.emptyState}>{books.error}</p>
            ) : null}

            {selectorIntegrations.length > 0 && section === 'books' ? (
              <label style={{ ...s.field, marginBottom: 16, maxWidth: 360 }}>
                מערכת מחוברת
                <select
                  style={s.input}
                  value={selectedIntegrationId}
                  onChange={(ev) => {
                    setSelectedIntegrationId(ev.target.value)
                  }}
                >
                  {selectorIntegrations.map((i, idx) => (
                    <option key={String(i.id || idx)} value={String(i.id || '')}>
                      {integrationLabel(i)}
                      {i.ready === true ? ' · מוכן' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {section === 'books' && (
              <>
                <p style={s.panelTitle}>מערכות מחוברות</p>
                <ul style={s.ledger}>
                  {integrations.length > 0 ? (
                    integrations.map((i, idx) => (
                      <li key={String(i.id || idx)} style={s.ledgerRow}>
                        <span style={s.ledgerTitle}>
                          {integrationLabel(i)}
                          {i.category ? ` · ${String(i.category)}` : ''}
                        </span>
                        <span
                          style={{
                            ...s.statusPill,
                            background:
                              i.ready === true
                                ? theme.colors.successMuted
                                : theme.colors.warningMuted,
                            color:
                              i.ready === true ? theme.colors.success : theme.colors.warning,
                          }}
                        >
                          {i.ready === true ? 'מוכן' : 'לא מוכן'}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li style={s.emptyState}>
                      אין מערכות מחוברות — חברו iCount / Morning ב־Financy.
                    </li>
                  )}
                </ul>

                <p style={{ ...s.panelTitle, marginTop: 20 }}>מי חייב (receivables)</p>
                {books?.receivables_error ? (
                  <p style={s.emptyState}>{String(books.receivables_error)}</p>
                ) : (
                  <>
                    {receivablesByCurrency.length > 0 ? (
                      <div style={s.linkRow}>
                        {receivablesByCurrency.map((row, idx) => {
                          const totals = row.totals as Record<string, unknown> | undefined
                          const open =
                            typeof totals?.openMinor === 'number' ? totals.openMinor : null
                          const overdue =
                            typeof totals?.overdueMinor === 'number'
                              ? totals.overdueMinor
                              : null
                          return (
                            <div key={idx} style={s.statTile}>
                              <span style={s.statLabel}>{String(row.currency || 'ILS')}</span>
                              <span style={s.statValue}>
                                {open != null ? formatMinorIls(open) : '—'}
                              </span>
                              {overdue != null && overdue > 0 ? (
                                <span style={{ ...s.muted, color: theme.colors.warning }}>
                                  באיחור {formatMinorIls(overdue)}
                                </span>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                    {receivablesCustomers.length > 0 ? (
                      <ul style={s.ledger}>
                        {receivablesCustomers.map((c, idx) => {
                          const cp = (c.counterparty || {}) as Record<string, unknown>
                          const open =
                            typeof c.openMinor === 'number' ? c.openMinor : null
                          const days =
                            typeof c.maxDaysPastDue === 'number' ? c.maxDaysPastDue : null
                          return (
                            <li key={String(cp.id || idx)} style={s.ledgerRow}>
                              <div style={s.ledgerMain}>
                                <span style={s.ledgerTitle}>
                                  {String(cp.name || 'לקוח')}
                                </span>
                                <span style={s.ledgerSub}>
                                  {days != null && days > 0 ? `${days} ימים באיחור` : 'פתוח'}
                                  {typeof c.documentCount === 'number'
                                    ? ` · ${c.documentCount} מסמכים`
                                    : ''}
                                </span>
                              </div>
                              <span style={s.ledgerAmount}>
                                {open != null ? formatMinorIls(open) : '—'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p style={s.emptyState}>אין נתוני חייבים עדיין.</p>
                    )}
                  </>
                )}

                <p style={{ ...s.panelTitle, marginTop: 20 }}>לקוחות</p>
                {books?.customers_error ? (
                  <p style={s.emptyState}>{String(books.customers_error)}</p>
                ) : bookCustomers.length > 0 ? (
                  <ul style={s.ledger}>
                    {bookCustomers.slice(0, 30).map((c, idx) => (
                      <li key={String(c.id || idx)} style={s.ledgerRow}>
                        <span style={s.ledgerTitle}>
                          {String(c.name || c.displayName || c.id || 'לקוח')}
                        </span>
                        <span style={s.ledgerSub}>
                          {String(c.businessTaxId || c.email || c.phone || '')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={s.emptyState}>אין לקוחות מסונכרנים.</p>
                )}

                <p style={{ ...s.panelTitle, marginTop: 20 }}>מסמכים אחרונים</p>
                {books?.documents_error ? (
                  <p style={s.emptyState}>{String(books.documents_error)}</p>
                ) : documents.length > 0 ? (
                  <ul style={s.ledger}>
                    {documents.slice(0, 30).map((d, idx) => {
                      const amount =
                        typeof d.amountMinor === 'number'
                          ? formatMinorIls(d.amountMinor)
                          : typeof d.amount === 'number'
                            ? formatIls(d.amount)
                            : null
                      return (
                        <li key={String(d.id || idx)} style={s.ledgerRow}>
                          <div style={s.ledgerMain}>
                            <span style={s.ledgerTitle}>
                              {String(d.type || d.doctype || d.number || 'מסמך')}
                            </span>
                            <span style={s.ledgerSub}>
                              {String(d.customerName || d.clientName || d.status || '')}
                              {d.issueDate ? ` · ${String(d.issueDate)}` : ''}
                            </span>
                          </div>
                          {amount ? <span style={s.ledgerAmount}>{amount}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p style={s.emptyState}>אין מסמכים.</p>
                )}

                <p style={{ ...s.panelTitle, marginTop: 20 }}>טיוטות ממתינות</p>
                <ul style={s.ledger}>
                  {proposals.length > 0 ? (
                    proposals.map((p, idx) => (
                      <li key={String(p.id || idx)} style={s.ledgerRow}>
                        <span style={s.ledgerTitle}>{String(p.status || 'טיוטה')}</span>
                        {typeof p.approvalUrl === 'string' ? (
                          <a
                            href={p.approvalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={s.inlineLink}
                          >
                            אישור ב־Financy
                          </a>
                        ) : null}
                      </li>
                    ))
                  ) : (
                    <li style={s.emptyState}>אין טיוטות.</li>
                  )}
                </ul>
              </>
            )}

            {section === 'clearing' && (
              <>
                {books?.integrations_error ? (
                  <p style={s.emptyState}>{String(books.integrations_error)}</p>
                ) : null}
                {!clearingIntegrationId ? (
                  <p style={s.emptyState}>
                    אין חיבור סליקה ב־Financy למשתמש ה־API. Isracard Business / Pelecard דורשים תוכנית
                    Pro ומעלה — אחרי שדרוג וחיבור בהגדרות Financy, חזרו לכאן ורעננו.
                  </p>
                ) : (
                  <p style={{ ...s.ledgerSub, marginBottom: 12 }}>
                    חיבור סליקה פעיל
                    {clearingIntegrations[0]
                      ? `: ${integrationLabel(clearingIntegrations[0])}`
                      : ''}
                  </p>
                )}

                <p style={s.panelTitle}>הפקדות סליקה</p>
                {clearing?.settlements_error ? (
                  <p style={s.emptyState}>{String(clearing.settlements_error)}</p>
                ) : settlements.length > 0 ? (
                  <ul style={s.ledger}>
                    {settlements.map((row, idx) => {
                      const amount = clearingAmountLabel(row)
                      const statusHe =
                        String(row.status || '') === 'expected'
                          ? 'צפויה'
                          : String(row.status || '') === 'settled'
                            ? 'הופקדה'
                            : String(row.status || row.paymentDate || 'הפקדה')
                      return (
                        <li key={String(row.id || idx)} style={s.ledgerRow}>
                          <div style={s.ledgerMain}>
                            <span style={s.ledgerTitle}>{statusHe}</span>
                            <span style={s.ledgerSub}>
                              {String(row.currency || 'ILS')}
                              {row.paymentDate ? ` · ${String(row.paymentDate)}` : ''}
                              {row.branch ? ` · סניף ${String(row.branch)}` : ''}
                            </span>
                          </div>
                          {amount ? <span style={s.ledgerAmount}>{amount}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p style={s.emptyState}>
                    {clearingIntegrationId
                      ? 'אין הפקדות סליקה עדיין (ייתכן שהסנכרון הראשון עדיין רץ ב־Financy).'
                      : 'אין הפקדות — חברו Isracard Business ב־Financy (תוכנית Pro+).'}
                  </p>
                )}

                <p style={{ ...s.panelTitle, marginTop: 20 }}>עסקאות כרטיס</p>
                {clearing?.card_transactions_error ? (
                  <p style={s.emptyState}>{String(clearing.card_transactions_error)}</p>
                ) : cardTx.length > 0 ? (
                  <ul style={s.ledger}>
                    {cardTx.map((row, idx) => {
                      const amount = clearingAmountLabel(row)
                      return (
                        <li key={String(row.id || idx)} style={s.ledgerRow}>
                          <div style={s.ledgerMain}>
                            <span style={s.ledgerTitle}>
                              {String(row.kind || row.cardBrand || 'עסקה')}
                            </span>
                            <span style={s.ledgerSub}>
                              {String(row.status || row.creditTerms || '')}
                              {row.transactionDate ? ` · ${String(row.transactionDate)}` : ''}
                            </span>
                          </div>
                          {amount ? <span style={s.ledgerAmount}>{amount}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p style={s.emptyState}>
                    {clearingIntegrationId
                      ? 'אין עסקאות כרטיס לחיבור זה (Pelecard מביא charges/refunds; Isracard מביא הפקדות).'
                      : 'אין עסקאות כרטיס — חברו Pelecard ב־Financy (תוכנית Pro+).'}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bankHeroIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bank-hero-balance {
          animation: bankHeroIn 280ms ease-out;
        }
      `}</style>
    </div>
  )
}

function styles(isMobile: boolean, tabCount = 5): Record<string, CSSProperties> {
  const columns = Math.max(tabCount, 1)
  return {
    wrap: {
      direction: 'rtl',
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? 14 : 18,
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    },
    loadingWrap: {
      display: 'flex',
      justifyContent: 'center',
      padding: 56,
    },
    connectHero: {
      padding: isMobile ? '18px 16px' : '22px 24px',
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.colors.borderStrong}`,
      borderInlineStart: `3px solid ${theme.colors.primary}`,
      background: `linear-gradient(115deg, ${theme.colors.surfaceActive} 0%, ${theme.colors.surface} 55%, ${theme.colors.background} 100%)`,
      boxShadow: theme.shadows.xs,
    },
    connectEyebrow: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      color: theme.colors.textMuted,
      letterSpacing: '0.02em',
    },
    connectTitle: {
      margin: '8px 0 0',
      fontSize: isMobile ? 20 : 24,
      fontWeight: 700,
      color: theme.colors.textPrimary,
      lineHeight: 1.3,
    },
    connectLead: {
      margin: '8px 0 0',
      fontSize: 14,
      lineHeight: 1.55,
      color: theme.colors.textSecondary,
      maxWidth: 520,
    },
    mutedCenter: { margin: 0, textAlign: 'center', fontSize: 13, color: theme.colors.textMuted },
    hero: {
      padding: isMobile ? '20px 16px' : '28px 28px 22px',
      borderRadius: theme.radius.xl,
      border: `1px solid ${theme.colors.borderStrong}`,
      borderInlineStart: `3px solid ${theme.colors.primary}`,
      background: `linear-gradient(120deg, ${theme.colors.navy} 0%, ${theme.colors.navySoft} 48%, #1e3a5f 100%)`,
      color: theme.colors.textInverse,
      boxShadow: theme.shadows.md,
      overflow: 'hidden',
      position: 'relative',
    },
    heroTop: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      alignItems: isMobile ? 'stretch' : 'flex-start',
      flexDirection: isMobile ? 'column' : 'row',
      flexWrap: 'wrap',
    },
    heroEyebrow: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      color: 'rgba(226, 232, 240, 0.72)',
    },
    heroLabel: {
      margin: '10px 0 0',
      fontSize: 13,
      fontWeight: 500,
      color: 'rgba(226, 232, 240, 0.85)',
    },
    heroBalance: {
      margin: '4px 0 0',
      fontSize: isMobile ? 36 : 44,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
      fontVariantNumeric: 'tabular-nums',
    },
    heroMeta: {
      margin: '10px 0 0',
      fontSize: 13,
      color: 'rgba(203, 213, 225, 0.9)',
    },
    heroEmpty: {
      margin: '16px 0 0',
      fontSize: 13,
      color: 'rgba(203, 213, 225, 0.85)',
    },
    heroActions: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
    },
    accountStrip: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 18,
      paddingTop: 16,
      borderTop: '1px solid rgba(148, 163, 184, 0.25)',
    },
    accountChip: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: isMobile ? '46%' : 140,
      flex: isMobile ? '1 1 46%' : '0 0 auto',
      padding: '10px 12px',
      borderRadius: theme.radius.md,
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)',
    },
    accountChipCard: {
      background: 'rgba(251, 191, 36, 0.12)',
      border: '1px dashed rgba(252, 211, 77, 0.55)',
    },
    accountKind: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.01em',
      color: 'rgba(148, 163, 184, 0.95)',
    },
    accountKindCard: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.01em',
      color: 'rgba(253, 230, 138, 0.95)',
    },
    accountName: {
      fontSize: 12,
      color: 'rgba(226, 232, 240, 0.8)',
      overflowWrap: 'anywhere',
    },
    accountBal: {
      fontSize: 16,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
    },
    accountBalCard: {
      fontSize: 16,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: 'rgba(254, 243, 199, 0.98)',
    },
    tabs: {
      display: 'grid',
      /* Explicit RTL so סקירה is start (right) and סליקה is end (left). */
      direction: 'rtl',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 4,
      padding: 4,
      borderRadius: theme.radius.md,
      background: theme.colors.surfaceInset,
      border: `1px solid ${theme.colors.border}`,
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
    },
    tab: {
      appearance: 'none',
      border: 'none',
      background: 'transparent',
      borderRadius: theme.radius.sm,
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: isMobile ? '10px 6px' : '8px 6px',
      cursor: 'pointer',
      fontSize: isMobile ? 12 : 13,
      fontWeight: 600,
      color: theme.colors.textSecondary,
      whiteSpace: 'nowrap',
      minHeight: isMobile ? 44 : 36,
      fontFamily: 'inherit',
      transition: `background ${theme.motion.fast} ease, color ${theme.motion.fast} ease`,
    },
    tabActive: {
      background: theme.colors.surface,
      color: theme.colors.primary,
      boxShadow: theme.shadows.xs,
    },
    panel: {
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.colors.border}`,
      background: theme.colors.surface,
      padding: isMobile ? 14 : 20,
      boxShadow: theme.shadows.xs,
      minWidth: 0,
    },
    panelHead: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12,
      marginBottom: 12,
    },
    panelTitle: {
      margin: 0,
      fontSize: 15,
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    overviewGrid: {
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, minmax(0, 1fr))',
      gap: 12,
    },
    fullBleed: {
      gridColumn: '1 / -1',
      marginTop: 4,
      paddingTop: 8,
    },
    statTile: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '14px 16px',
      borderRadius: theme.radius.md,
      background: theme.colors.surfaceInset,
      border: `1px solid ${theme.colors.borderSubtle}`,
    },
    statLabel: { fontSize: 12, fontWeight: 600, color: theme.colors.textMuted },
    statValue: {
      fontSize: isMobile ? 22 : 26,
      fontWeight: 700,
      color: theme.colors.textPrimary,
      fontVariantNumeric: 'tabular-nums',
    },
    quickLinks: {
      gridColumn: '1 / -1',
      marginTop: 4,
      paddingTop: 14,
      borderTop: `1px solid ${theme.colors.divider}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    linkRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    pillLink: {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 36,
      padding: '0 12px',
      borderRadius: theme.radius.sm,
      border: `1px solid ${theme.colors.border}`,
      background: theme.colors.surface,
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: 600,
      textDecoration: 'none',
    },
    ledger: { listStyle: 'none', margin: 0, padding: 0 },
    ledgerRow: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      padding: isMobile ? '12px 0' : '12px 2px',
      borderBottom: `1px solid ${theme.colors.divider}`,
      alignItems: isMobile ? 'stretch' : 'flex-start',
      flexDirection: isMobile ? 'column' : 'row',
      minWidth: 0,
    },
    ledgerMain: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
    ledgerTitle: {
      fontSize: 14,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      overflowWrap: 'anywhere',
    },
    ledgerSub: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.45 },
    ledgerAside: {
      display: 'flex',
      flexDirection: isMobile ? 'row' : 'column',
      alignItems: isMobile ? 'center' : 'flex-end',
      justifyContent: isMobile ? 'space-between' : undefined,
      gap: 4,
      flexShrink: 0,
    },
    ledgerAmount: {
      fontSize: 15,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: theme.colors.textPrimary,
    },
    textBtn: {
      appearance: 'none',
      background: 'none',
      border: 'none',
      color: theme.colors.primary,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      padding: isMobile ? '8px 0' : 0,
      fontFamily: 'inherit',
      minHeight: isMobile ? 40 : undefined,
      textAlign: 'start',
    },
    transferLayout: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? 20 : 28,
      alignItems: 'flex-start',
    },
    transferForm: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      width: '100%',
      maxWidth: isMobile ? '100%' : 360,
      padding: isMobile ? 0 : 16,
      borderRadius: isMobile ? 0 : theme.radius.md,
      border: isMobile ? 'none' : `1px solid ${theme.colors.border}`,
      background: isMobile ? 'transparent' : theme.colors.surfaceInset,
      boxSizing: 'border-box',
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 12,
      fontWeight: 600,
      color: theme.colors.textSecondary,
    },
    input: {
      border: `1px solid ${theme.colors.inputBorder}`,
      borderRadius: theme.radius.sm,
      padding: isMobile ? '12px' : '10px 12px',
      fontSize: isMobile ? 16 : 14,
      fontWeight: 400,
      color: theme.colors.textPrimary,
      background: theme.colors.inputBackground,
      width: '100%',
      boxSizing: 'border-box',
      minHeight: isMobile ? 48 : 40,
      fontFamily: 'inherit',
    },
    statusPill: {
      fontSize: 12,
      fontWeight: 700,
      padding: '4px 10px',
      borderRadius: theme.radius.sm,
      alignSelf: isMobile ? 'flex-start' : undefined,
    },
    emptyState: {
      margin: 0,
      padding: '20px 4px',
      fontSize: 14,
      color: theme.colors.textMuted,
      lineHeight: 1.5,
    },
    muted: {
      margin: 0,
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 1.5,
    },
    inlineLink: {
      color: theme.colors.primary,
      fontWeight: 600,
      fontSize: 13,
      textDecoration: 'none',
    },
  }
}
