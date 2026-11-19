/**
 * Financy REST gateway — method names parallel MCP tools (+ PIS payments).
 * Never call from the browser; server-only with per-tenant credentials.
 */

import { fetchWithTimeout } from '@/lib/fetch-timeout'
import {
  clearFinancyTokenCache,
  getFinancyAccessToken,
  type FinancyCredentials,
} from '@/lib/bank/financy-auth'
import type {
  FinancyAccount,
  FinancyConnection,
  FinancyDraftProposal,
  FinancyIntegration,
  FinancyMoney,
  FinancyPaymentCreateResult,
  FinancyPaymentStatus,
  FinancyTransaction,
} from '@/lib/bank/types'

const API_BASE = 'https://api.open-finance.ai/v2'
const INTEGRATIONS_BASE = 'https://api.open-finance.ai/integrations'

export type FinancyGatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

type Query = Record<string, string | number | boolean | undefined | null>

function toQuery(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const q = sp.toString()
  return q ? `?${q}` : ''
}

const DEFAULT_FETCH_TIMEOUT_MS = 25_000
/** Refresh / payment create can sit behind Financy chat or journey setup. */
const LONG_FETCH_TIMEOUT_MS = 45_000

async function financyFetch<T>(
  creds: FinancyCredentials,
  url: string,
  init: RequestInit = {},
  retried = false,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<FinancyGatewayResult<T>> {
  const token = await getFinancyAccessToken(creds)
  if (!token.ok) return { ok: false, error: token.error }

  const res = await fetchWithTimeout(
    url,
    {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    },
    timeoutMs
  )

  if (!res) return { ok: false, error: 'Financy request timeout' }

  if (res.status === 401 && !retried) {
    clearFinancyTokenCache(creds)
    return financyFetch(creds, url, init, true, timeoutMs)
  }

  const json = (await res.json().catch(() => null)) as T & {
    type?: string
    error?: string
    message?: string
    reason?: string
  } | null

  if (!res.ok) {
    const { formatFinancyError } = await import('@/lib/bank/financy-errors')
    return {
      ok: false,
      status: res.status,
      error: formatFinancyError({
        status: res.status,
        type: json?.type,
        message: json?.message,
        error: json?.error,
        reason: json?.reason,
      }),
    }
  }

  return { ok: true, data: (json ?? ({} as T)) as T }
}

function unwrapList<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    for (const k of keys) {
      if (Array.isArray(obj[k])) return obj[k] as T[]
    }
  }
  return []
}

export async function listConnections(
  creds: FinancyCredentials,
  params?: { limit?: number; nextPage?: string; status?: string }
): Promise<FinancyGatewayResult<{ items: FinancyConnection[]; nextPage?: string }>> {
  // Official path is /v2/connections (not /v2/data/connections).
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${API_BASE}/connections${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList<FinancyConnection>(res.data, ['items', 'connections', 'data']),
      nextPage: typeof res.data.nextPage === 'string' ? res.data.nextPage : undefined,
    },
  }
}

/** Freshness rollup from connections (CLI `financy status` equivalent). */
export async function getStatus(
  creds: FinancyCredentials
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  const listed = await listConnections(creds, { limit: 50 })
  if (!listed.ok) return listed
  return {
    ok: true,
    data: {
      data: listed.data.items.map((c) => ({
        id: c.id,
        provider: c.providerId ?? null,
        status: c.status ?? null,
        accounts: typeof c.accounts === 'number' ? c.accounts : null,
        expires: (c.expiryDate as string | undefined) ?? c.consentExpiresAt ?? null,
        fresh:
          (c.lastFetchedDataDate as string | undefined) ??
          (c.lastFetchedAt as string | undefined) ??
          c.dataThrough ??
          null,
      })),
      count: listed.data.items.length,
    },
  }
}

export async function listAccounts(
  creds: FinancyCredentials,
  params?: { connectionId?: string; type?: string; limit?: number; nextPage?: string }
): Promise<FinancyGatewayResult<{ items: FinancyAccount[]; nextPage?: string }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${API_BASE}/data/accounts${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList<FinancyAccount>(res.data, ['items', 'accounts', 'data']),
      nextPage: typeof res.data.nextPage === 'string' ? res.data.nextPage : undefined,
    },
  }
}

export async function getAccount(
  creds: FinancyCredentials,
  accountId: string
): Promise<FinancyGatewayResult<FinancyAccount>> {
  return financyFetch(creds, `${API_BASE}/data/accounts/${encodeURIComponent(accountId)}`)
}

export async function listTransactions(
  creds: FinancyCredentials,
  params: {
    dateFrom?: string
    dateTo?: string
    accountId?: string
    connectionId?: string
    type?: 'BANK' | 'CARD'
    limit?: number
    nextPage?: string
    sort?: number
  }
): Promise<FinancyGatewayResult<{ items: FinancyTransaction[]; nextPage?: string }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${API_BASE}/data/transactions${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList<FinancyTransaction>(res.data, ['items', 'transactions', 'data']),
      nextPage: typeof res.data.nextPage === 'string' ? res.data.nextPage : undefined,
    },
  }
}

export async function getTransaction(
  creds: FinancyCredentials,
  sk: string
): Promise<FinancyGatewayResult<FinancyTransaction>> {
  return financyFetch(
    creds,
    `${API_BASE}/data/transactions/${encodeURIComponent(sk)}`
  )
}

export async function listCategories(
  creds: FinancyCredentials
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  return financyFetch(creds, `${API_BASE}/data/transaction-categories`)
}

export async function refreshConnections(
  creds: FinancyCredentials
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  // Docs: doubled /chat is intentional — chat gateway + route path.
  return financyFetch(
    creds,
    'https://api.open-finance.ai/chat/chat/connections/refresh',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    false,
    LONG_FETCH_TIMEOUT_MS
  )
}

export async function listProviders(
  creds: FinancyCredentials
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>> }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${API_BASE}/providers`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList(res.data, ['items', 'providers', 'data']),
    },
  }
}

export async function createPayment(
  creds: FinancyCredentials,
  body: Record<string, unknown>
): Promise<FinancyGatewayResult<FinancyPaymentCreateResult>> {
  return financyFetch(
    creds,
    `${API_BASE}/payments`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    false,
    LONG_FETCH_TIMEOUT_MS
  )
}

export async function getPaymentStatus(
  creds: FinancyCredentials,
  paymentId: string
): Promise<FinancyGatewayResult<FinancyPaymentStatus>> {
  return financyFetch(
    creds,
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}/status`
  )
}

export async function listMerchants(
  creds: FinancyCredentials,
  params?: { limit?: number; nextPage?: string; sort?: number }
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>>; nextPage?: string }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${API_BASE}/merchants${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList(res.data, ['items', 'merchants', 'data']),
      nextPage: typeof res.data.nextPage === 'string' ? res.data.nextPage : undefined,
    },
  }
}

export async function createMerchant(
  creds: FinancyCredentials,
  body: {
    name: string
    displayName?: string
    iban?: string
    bban?: string
    phoneNumber?: string
    psuId?: string
    psuCorporateId?: string
  }
): Promise<FinancyGatewayResult<{ id: string } & Record<string, unknown>>> {
  return financyFetch(creds, `${API_BASE}/merchants`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Infer Financy creditorAccountType from an Israeli IBAN/BBAN string. */
export function inferCreditorAccountType(account: string): 'iban' | 'bban' {
  const cleaned = account.replace(/\s+/g, '').toUpperCase()
  if (/^IL\d{2}/i.test(cleaned) || cleaned.length >= 20) return 'iban'
  return 'bban'
}

export type FinancyPaymentSideAccount = {
  accountType: 'iban' | 'bban'
  accountNumber: string
}

/**
 * Resolve debtor (payer) account details for PIS from a Financy AIS account.
 * Outgoing transfers to an external creditor require a connected debtor account.
 *
 * Prefer Israeli BBAN (`bank-branch-number`) over IBAN: Financy's hosted Discount
 * journey often freezes a truncated account when only IBAN is supplied.
 */
export function extractDebtorPaymentAccount(
  account: FinancyAccount | Record<string, unknown> | null | undefined
): FinancyPaymentSideAccount | null {
  if (!account || typeof account !== 'object') return null
  const a = account as {
    accountNumber?: unknown
    iban?: unknown
    bban?: unknown
    parsedAccount?: { number?: unknown; branch?: unknown; bank?: unknown }
  }

  const bank =
    typeof a.parsedAccount?.bank === 'string' ? a.parsedAccount.bank.trim() : ''
  const branch =
    typeof a.parsedAccount?.branch === 'string' ? a.parsedAccount.branch.trim() : ''
  const number =
    typeof a.parsedAccount?.number === 'string' ? a.parsedAccount.number.trim() : ''
  if (bank && branch && number) {
    // Strip leading zeros on bank code so Discount is `11` not `011`.
    const bankCode = bank.replace(/^0+(?=\d)/, '') || bank
    return {
      accountType: 'bban',
      accountNumber: `${bankCode}-${branch}-${number}`,
    }
  }

  if (typeof a.bban === 'string' && a.bban.trim()) {
    return {
      accountType: 'bban',
      accountNumber: a.bban.replace(/\s+/g, ''),
    }
  }

  const ibanCandidate =
    (typeof a.iban === 'string' && a.iban.trim()) ||
    (typeof a.accountNumber === 'string' && /^IL\d{2}/i.test(a.accountNumber.replace(/\s+/g, ''))
      ? a.accountNumber.trim()
      : '')
  if (ibanCandidate) {
    return {
      accountType: 'iban',
      accountNumber: ibanCandidate.replace(/\s+/g, '').toUpperCase(),
    }
  }

  if (typeof a.accountNumber === 'string' && a.accountNumber.trim()) {
    const cleaned = a.accountNumber.replace(/\s+/g, '')
    return {
      accountType: inferCreditorAccountType(cleaned),
      accountNumber: cleaned,
    }
  }
  return null
}

/** National / corporate id hints from AIS raw — prefill Financy PIS when present. */
export function extractPaymentPsuIds(
  account: FinancyAccount | Record<string, unknown> | null | undefined
): { psuId?: string; psuCorporateId?: string } {
  if (!account || typeof account !== 'object') return {}
  const a = account as {
    psuId?: unknown
    psuCorporateId?: unknown
    usage?: unknown
  }
  const psuId =
    typeof a.psuId === 'string' && /^\d{5,9}$/.test(a.psuId.trim())
      ? a.psuId.trim()
      : undefined
  const psuCorporateId =
    typeof a.psuCorporateId === 'string' && /^\d{8,9}$/.test(a.psuCorporateId.trim())
      ? a.psuCorporateId.trim()
      : undefined
  return { psuId, psuCorporateId }
}

/** Financy list route requires trailing slash (`GET /integrations/` → 200; bare `/integrations` → 404). */
function normalizeFinancyIntegration(raw: FinancyIntegration): FinancyIntegration {
  const status = String(raw.status || '').toLowerCase()
  const provider =
    (typeof raw.provider === 'string' && raw.provider) ||
    (typeof raw.connectorId === 'string' && raw.connectorId) ||
    (typeof raw.connectorName === 'string' && raw.connectorName) ||
    null
  const ready =
    raw.ready === true || status === 'active' || status === 'connected' || status === 'ready'
  return {
    ...raw,
    id: String(raw.id || ''),
    category: raw.category,
    provider,
    ready,
  }
}

export async function listIntegrations(
  creds: FinancyCredentials
): Promise<FinancyGatewayResult<{ items: FinancyIntegration[] }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    // Trailing slash is required by Financy (docs + live probe).
    `${INTEGRATIONS_BASE}/`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList<FinancyIntegration>(res.data, [
        'items',
        'integrations',
        'data',
      ]).map(normalizeFinancyIntegration),
    },
  }
}

export async function getIntegration(
  creds: FinancyCredentials,
  integrationId: string
): Promise<FinancyGatewayResult<FinancyIntegration>> {
  return financyFetch(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}`
  )
}

export async function getReceivables(
  creds: FinancyCredentials,
  params?: {
    asOf?: string
    format?: 'concise' | 'detailed'
    customerLimit?: number
    includeProforma?: boolean
    integrationIds?: string
  }
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  return financyFetch(
    creds,
    `${INTEGRATIONS_BASE}/receivables${toQuery(params)}`
  )
}

export async function listInvoicingDocuments(
  creds: FinancyCredentials,
  integrationId: string,
  params?: { limit?: number; nextPage?: string }
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>> }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/documents${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: { items: unwrapList(res.data, ['items', 'documents', 'data']) },
  }
}

export async function getInvoicingDocument(
  creds: FinancyCredentials,
  integrationId: string,
  documentId: string
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  return financyFetch(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/documents/${encodeURIComponent(documentId)}`
  )
}

export async function listInvoicingCustomers(
  creds: FinancyCredentials,
  integrationId: string,
  params?: { limit?: number; nextPage?: string }
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>> }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/customers${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: { items: unwrapList(res.data, ['items', 'customers', 'data']) },
  }
}

export async function getInvoicingCustomer(
  creds: FinancyCredentials,
  integrationId: string,
  customerId: string
): Promise<FinancyGatewayResult<Record<string, unknown>>> {
  return financyFetch(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/customers/${encodeURIComponent(customerId)}`
  )
}

export async function listProposals(
  creds: FinancyCredentials,
  params?: { integrationId?: string; status?: string; limit?: number }
): Promise<FinancyGatewayResult<{ items: FinancyDraftProposal[] }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${INTEGRATIONS_BASE}/proposals${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: {
      items: unwrapList<FinancyDraftProposal>(res.data, [
        'items',
        'proposals',
        'data',
      ]),
    },
  }
}

export async function getProposal(
  creds: FinancyCredentials,
  proposalId: string
): Promise<FinancyGatewayResult<FinancyDraftProposal>> {
  return financyFetch(
    creds,
    `${INTEGRATIONS_BASE}/proposals/${encodeURIComponent(proposalId)}`
  )
}

export async function draftInvoice(
  creds: FinancyCredentials,
  body: Record<string, unknown>
): Promise<FinancyGatewayResult<FinancyDraftProposal>> {
  return financyFetch(creds, `${INTEGRATIONS_BASE}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ ...body, doctype: body.doctype || 'invoice' }),
  })
}

export async function draftInvoiceReceipt(
  creds: FinancyCredentials,
  body: Record<string, unknown>
): Promise<FinancyGatewayResult<FinancyDraftProposal>> {
  return financyFetch(creds, `${INTEGRATIONS_BASE}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ ...body, doctype: 'invrec' }),
  })
}

export async function draftReceipt(
  creds: FinancyCredentials,
  body: Record<string, unknown>
): Promise<FinancyGatewayResult<FinancyDraftProposal>> {
  return financyFetch(creds, `${INTEGRATIONS_BASE}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ ...body, doctype: 'receipt' }),
  })
}

export async function draftCreditNote(
  creds: FinancyCredentials,
  body: Record<string, unknown>
): Promise<FinancyGatewayResult<FinancyDraftProposal>> {
  return financyFetch(creds, `${INTEGRATIONS_BASE}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ ...body, doctype: 'refund' }),
  })
}

export async function listClearingSettlements(
  creds: FinancyCredentials,
  integrationId: string,
  params?: { limit?: number; nextPage?: string }
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>> }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/settlements${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: { items: unwrapList(res.data, ['items', 'settlements', 'data']) },
  }
}

export async function listCardTransactions(
  creds: FinancyCredentials,
  integrationId: string,
  params?: { limit?: number; nextPage?: string }
): Promise<FinancyGatewayResult<{ items: Array<Record<string, unknown>> }>> {
  const res = await financyFetch<Record<string, unknown>>(
    creds,
    `${INTEGRATIONS_BASE}/${encodeURIComponent(integrationId)}/card-transactions${toQuery(params)}`
  )
  if (!res.ok) return res
  return {
    ok: true,
    data: { items: unwrapList(res.data, ['items', 'transactions', 'data']) },
  }
}

function parseMoneyAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

type FinancyBalanceEntry = {
  balanceType?: string
  balanceAmount?: { amount?: number | string; currency?: string }
  amount?: number | string
  currency?: string
  creditLimitIncluded?: boolean
}

const BALANCE_TYPE_PRIORITY = [
  'closingBooked',
  'interimBooked',
  'expected',
  'interimAvailable',
  'forwardAvailable',
  'openingBooked',
] as const

/**
 * Financy returns `balances` as an array of { balanceType, balanceAmount }.
 * Prefer booked/official balances over open-to-buy (interimAvailable + creditLimit).
 */
export function extractBalanceAmount(account: FinancyAccount): number | null {
  const b = account.balance
  if (typeof b === 'number' && Number.isFinite(b)) return b
  if (b && typeof b === 'object') {
    const fromObj = parseMoneyAmount((b as FinancyMoney).amount)
    if (fromObj != null) return fromObj
  }

  const anyAcc = account as {
    balances?: FinancyBalanceEntry[] | { available?: FinancyMoney; current?: FinancyMoney }
  }
  const balances = anyAcc.balances

  if (Array.isArray(balances) && balances.length > 0) {
    const scored = balances
      .map((entry, index) => {
        const amount =
          parseMoneyAmount(entry.balanceAmount?.amount) ?? parseMoneyAmount(entry.amount)
        if (amount == null) return null
        const type = typeof entry.balanceType === 'string' ? entry.balanceType : ''
        let priority = BALANCE_TYPE_PRIORITY.indexOf(
          type as (typeof BALANCE_TYPE_PRIORITY)[number]
        )
        if (priority < 0) priority = BALANCE_TYPE_PRIORITY.length
        // Prefer entries that are not "open to buy" inflated by credit limit.
        if (entry.creditLimitIncluded === true) priority += 10
        return { amount, priority, index }
      })
      .filter((x): x is { amount: number; priority: number; index: number } => x != null)
      .sort((a, b) => a.priority - b.priority || a.index - b.index)

    if (scored[0]) return scored[0].amount
  } else if (balances && typeof balances === 'object' && !Array.isArray(balances)) {
    const avail = parseMoneyAmount(balances.available?.amount)
    if (avail != null) return avail
    const cur = parseMoneyAmount(balances.current?.amount)
    if (cur != null) return cur
  }

  return null
}

/** Human label: cards prefer product; checking prefers branch-number. */
export function extractAccountDisplayName(account: FinancyAccount): string | null {
  const a = account as {
    product?: unknown
    accountName?: unknown
    name?: unknown
    displayName?: unknown
    accountNumber?: unknown
    accountType?: unknown
    type?: unknown
    ownerInfo?: { fullName?: unknown }
    parsedAccount?: { number?: unknown; branch?: unknown; bank?: unknown }
  }
  const accountType = String(a.accountType || a.type || '').toUpperCase()
  const branch =
    typeof a.parsedAccount?.branch === 'string' ? a.parsedAccount.branch.trim() : ''
  const number =
    typeof a.parsedAccount?.number === 'string' ? a.parsedAccount.number.trim() : ''
  const parsedLabel = branch && number ? `${branch}-${number}` : number || null

  const candidates =
    accountType === 'CHECKING' || accountType === 'SAVINGS'
      ? [
          parsedLabel,
          a.accountNumber,
          a.product,
          a.accountName,
          a.name,
          a.displayName,
          a.ownerInfo?.fullName,
        ]
      : [
          a.product,
          a.accountName,
          a.name,
          a.displayName,
          a.accountNumber,
          parsedLabel,
          a.ownerInfo?.fullName,
        ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

export function extractAccountType(account: FinancyAccount): string | null {
  const a = account as { accountType?: unknown; type?: unknown }
  if (typeof a.accountType === 'string' && a.accountType.trim()) return a.accountType.trim()
  if (typeof a.type === 'string' && a.type.trim()) return a.type.trim()
  return null
}

/** Normalize AIS accountType for comparisons (CARD | CHECKING | …). */
export function normalizeFinancyAccountType(
  accountType: string | null | undefined
): string {
  return String(accountType || '').trim().toUpperCase()
}

/**
 * Credit-card / revolving products — liability / charge balance, not business cash.
 * Financy AIS uses `CARD`; also accept CREDIT / CREDIT_CARD variants.
 */
export function isFinancyCardAccountType(
  accountType: string | null | undefined
): boolean {
  const t = normalizeFinancyAccountType(accountType)
  if (!t) return false
  return t === 'CARD' || t === 'CREDIT' || t === 'CREDIT_CARD' || t.endsWith('_CARD')
}

/**
 * Checking / savings (and other non-card deposit products) — counts toward cash total.
 * Unknown / null types are treated as cash (legacy rows before type hydrate).
 */
export function isFinancyCashAccountType(
  accountType: string | null | undefined
): boolean {
  return !isFinancyCardAccountType(accountType)
}

/** Hebrew kind label for hero chips — cards must not read as extra cash. */
export function bankAccountKindLabelHe(
  accountType: string | null | undefined
): string {
  if (isFinancyCardAccountType(accountType)) return 'כרטיס · יתרת חיוב'
  const t = normalizeFinancyAccountType(accountType)
  if (t === 'SAVINGS') return 'חיסכון'
  if (t === 'CHECKING' || t === 'CURRENT' || t === 'BANK' || t === 'CASH' || t === 'DEPOSIT') {
    return 'עו״ש · מזומן'
  }
  return 'חשבון · מזומן'
}

export function extractAccountCurrency(account: FinancyAccount): string {
  if (typeof account.currency === 'string' && account.currency.trim()) {
    return account.currency.trim()
  }
  if (account.balance && typeof account.balance === 'object') {
    const c = (account.balance as FinancyMoney).currency
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  const balances = (account as { balances?: FinancyBalanceEntry[] }).balances
  if (Array.isArray(balances)) {
    for (const entry of balances) {
      const c = entry.balanceAmount?.currency || entry.currency
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }
  return 'ILS'
}

/** Skip soft-deleted / revoked AIS products so the bank screen stays clean. */
export function isFinancyAccountDeleted(account: FinancyAccount): boolean {
  const a = account as { status?: unknown; creditStatus?: unknown }
  const status = String(a.status || '').toLowerCase()
  const credit = String(a.creditStatus || '').toLowerCase()
  return status === 'deleted' || credit === 'deleted'
}

export function extractTxAmount(tx: FinancyTransaction): number {
  const charged = parseMoneyAmount(tx.amount?.chargedAmount?.amount)
  if (charged != null) return charged
  const original = parseMoneyAmount(tx.amount?.originalAmount?.amount)
  if (original != null) return original
  return 0
}
