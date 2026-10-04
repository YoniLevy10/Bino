import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { normalizePhone019 } from '@/lib/sms-019-core'
import {
  growApiBaseUrl,
  readGrowPlatformConfig,
  sanitizeGrowPlainText,
  type GrowEnv,
  type GrowPlatformConfig,
} from '@/lib/grow-config'

const GROW_TIMEOUT_MS = 20_000

export type GrowPaymentLinkRequest = {
  userId: string
  title: string
  amount: number
  fullName: string
  phone: string
  email?: string | null
  successUrl: string
  cancelUrl: string
  notifyUrl: string
  /** Bino public_token — returned on webhook as cField1 */
  publicToken: string
  vatType?: 1 | 3
  invoiceNotifyUrl?: string | null
}

export type GrowPaymentLinkResult =
  | {
      ok: true
      url: string
      paymentLinkProcessId: string
      paymentLinkProcessToken: string | null
    }
  | { ok: false; error: string }

export type GrowApproveRequest = {
  transactionId: string
  transactionToken: string
  transactionTypeId?: string
  paymentType?: string
}

export type GrowPaymentProcessRequest = {
  userId: string
  title: string
  amount: number
  fullName: string
  phone: string
  email?: string | null
  successUrl: string
  cancelUrl: string
  notifyUrl: string
  invoiceNotifyUrl?: string | null
  publicToken: string
}

export type GrowPaymentProcessResult =
  | {
      ok: true
      authCode: string
      processId: string
      processToken: string | null
    }
  | { ok: false; error: string }

function toGrowMobilePhone(raw: string): string {
  const normalized = normalizePhone019(raw.trim())
  if (normalized.startsWith('972')) return `0${normalized.slice(3)}`
  if (raw.startsWith('05')) return raw.replace(/\D/g, '').slice(0, 10)
  return raw.replace(/\D/g, '').slice(0, 10)
}

function growFullName(raw: string): string {
  const cleaned = sanitizeGrowPlainText(raw || 'דייר', 60)
  if (cleaned.split(' ').filter(Boolean).length >= 2) return cleaned
  return `${cleaned} דייר`.trim()
}

async function postGrowForm(
  env: GrowEnv,
  path: string,
  fields: Record<string, string>,
  xApiKey: string
): Promise<{ status: number; data: unknown } | { status: 0; data: null }> {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== '') body.append(key, value)
  }
  const res = await fetchWithTimeout(
    `${growApiBaseUrl(env)}${path}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-api-key': xApiKey,
      },
      body,
    },
    GROW_TIMEOUT_MS
  )
  if (!res) return { status: 0, data: null }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

function growErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const rec = data as Record<string, unknown>
  // Grow often returns err as { id, message } (GetLink / createPaymentLink).
  if (rec.err && typeof rec.err === 'object') {
    const errObj = rec.err as { message?: unknown; id?: unknown }
    if (typeof errObj.message === 'string' && errObj.message.trim()) {
      return errObj.message.trim()
    }
  }
  if (typeof rec.err === 'string' && rec.err.trim()) return rec.err.trim()
  if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim()
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim()
  return fallback
}

/** Grow API success — body `status` must be 1 / '1' (same rule as payment-link / payment-process parsers). */
export function isGrowApiSuccessStatus(status: unknown): boolean {
  return status === 1 || status === '1'
}

export function parseGrowPaymentLinkResponse(data: unknown): {
  url: string
  paymentLinkProcessId: string
  paymentLinkProcessToken: string | null
} | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  if (!isGrowApiSuccessStatus(rec.status)) return null
  const inner =
    rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : rec
  const url = typeof inner.url === 'string' ? inner.url.trim() : ''
  if (!url) return null
  const idRaw = inner.paymentLinkProcessId ?? inner.processId
  const paymentLinkProcessId = idRaw == null ? '' : String(idRaw)
  const tokenRaw = inner.paymentLinkProcessToken ?? inner.processToken
  const paymentLinkProcessToken = tokenRaw == null ? null : String(tokenRaw)
  return { url, paymentLinkProcessId, paymentLinkProcessToken }
}

export async function createGrowPaymentLink(
  request: GrowPaymentLinkRequest,
  platform: GrowPlatformConfig | null = readGrowPlatformConfig()
): Promise<GrowPaymentLinkResult> {
  if (!platform) {
    return { ok: false, error: 'חסרים מפתחות Grow של Bino בשרת' }
  }

  const phone = toGrowMobilePhone(request.phone)
  if (!/^05\d{8}$/.test(phone)) {
    return { ok: false, error: 'לדייר חסר מספר נייד ישראלי תקין לשליחת דרישת תשלום' }
  }

  const amount = Number(request.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'סכום החיוב אינו תקין' }
  }

  const vatType = request.vatType === 3 ? '3' : '1'
  // Grow requires top-level `sum` (total). Product line price alone returns err 707.
  const sum = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  const fields: Record<string, string> = {
    apiKey: platform.apiKey,
    userId: request.userId.trim(),
    pageCode: platform.pageCode,
    // Grow live checklist (2026-10): paymentLinkType=2 (not 1).
    paymentLinkType: '2',
    isActive: '1',
    chargeType: '1',
    sum,
    title: sanitizeGrowPlainText(request.title, 80) || 'חיוב ועד',
    successUrl: request.successUrl,
    cancelUrl: request.cancelUrl,
    notifyUrl: request.notifyUrl,
    cField1: request.publicToken,
    'pageFieldSettings[fullName][value]': growFullName(request.fullName),
    'pageFieldSettings[phone][value]': phone,
    'paymentTypes[0][type]': 'payments',
    'paymentTypes[0][payments][paymentsPaymentNum]': '1',
    'products[data][0][name]': sanitizeGrowPlainText(request.title, 80) || 'חיוב ועד',
    'products[data][0][price]': sum,
    'products[data][0][quantity]': '1',
    'products[data][0][vatType]': vatType,
    'transactionType[0]': '1',
    'transactionType[1]': '2',
    'transactionType[2]': '3',
    'transactionType[3]': '4',
    'transactionType[4]': '5',
    'transactionType[5]': '6',
  }
  if (request.email?.trim()) {
    fields['pageFieldSettings[email][value]'] = request.email.trim()
  }
  if (request.invoiceNotifyUrl?.trim()) {
    fields.invoiceNotifyUrl = request.invoiceNotifyUrl.trim()
  }

  const posted = await postGrowForm(platform.env, '/createPaymentLink', fields, platform.xApiKey)
  if (posted.status === 0) {
    return { ok: false, error: 'פסק זמן בחיבור ל-Grow' }
  }
  const parsed = parseGrowPaymentLinkResponse(posted.data)
  if (!parsed) {
    console.error('[grow] createPaymentLink failed', {
      httpStatus: posted.status,
      err: growErrorMessage(posted.data, ''),
    })
    return { ok: false, error: growErrorMessage(posted.data, 'יצירת דרישת תשלום ב-Grow נכשלה') }
  }
  return {
    ok: true,
    url: parsed.url,
    paymentLinkProcessId: parsed.paymentLinkProcessId,
    paymentLinkProcessToken: parsed.paymentLinkProcessToken,
  }
}

export async function approveGrowTransaction(
  request: GrowApproveRequest,
  platform: GrowPlatformConfig | null = readGrowPlatformConfig()
): Promise<{ ok: boolean; error?: string }> {
  if (!platform || !request.transactionId || !request.transactionToken) {
    return { ok: false, error: 'חסרים מזהי עסקה או מפתחות Grow' }
  }
  const fields: Record<string, string> = {
    apiKey: platform.apiKey,
    pageCode: platform.pageCode,
    transactionId: request.transactionId,
    transactionToken: request.transactionToken,
    transactionTypeId: request.transactionTypeId || '1',
    paymentType: request.paymentType || '2',
  }
  const posted = await postGrowForm(platform.env, '/approveTransaction', fields, platform.xApiKey)
  if (posted.status === 0) return { ok: false, error: 'פסק זמן באישור עסקה ל-Grow' }
  const rec = posted.data && typeof posted.data === 'object' ? (posted.data as { status?: unknown }) : null
  // Do not treat bare HTTP 200 as success — Grow returns business status in the JSON body
  // (createPaymentLink / createPaymentProcess already require status 1/'1'). Official Approve
  // readme (developers.grow.business/reference/approve-transaction) does not document HTTP-200-alone.
  const ok = isGrowApiSuccessStatus(rec?.status)
  return ok
    ? { ok: true }
    : { ok: false, error: growErrorMessage(posted.data, 'ApproveTransaction נכשל') }
}

function parseGrowPaymentProcessResponse(data: unknown): {
  authCode: string
  processId: string
  processToken: string | null
} | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  if (!isGrowApiSuccessStatus(rec.status)) return null
  const inner =
    rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : rec
  const authCode = typeof inner.authCode === 'string' ? inner.authCode.trim() : ''
  if (!authCode) return null
  const processId = inner.processId == null ? '' : String(inner.processId)
  const processToken = inner.processToken == null ? null : String(inner.processToken)
  return { authCode, processId, processToken }
}

/** Server-side wallet session — call immediately before renderPaymentOptions. */
export async function createGrowPaymentProcess(
  request: GrowPaymentProcessRequest,
  platform: GrowPlatformConfig | null = readGrowPlatformConfig()
): Promise<GrowPaymentProcessResult> {
  if (!platform) {
    return { ok: false, error: 'חסרים מפתחות Grow של Bino בשרת' }
  }

  const phone = toGrowMobilePhone(request.phone)
  if (!/^05\d{8}$/.test(phone)) {
    return { ok: false, error: 'לדייר חסר מספר נייד ישראלי תקין לפתיחת ארנק' }
  }

  const amount = Number(request.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'סכום החיוב אינו תקין' }
  }

  const sum = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  const fields: Record<string, string> = {
    apiKey: platform.apiKey,
    userId: request.userId.trim(),
    pageCode: platform.walletPageCode,
    sum,
    chargeType: '1',
    description: sanitizeGrowPlainText(request.title, 80) || 'חיוב ועד',
    successUrl: request.successUrl,
    cancelUrl: request.cancelUrl,
    notifyUrl: request.notifyUrl,
    cField1: request.publicToken,
    'pageField[fullName]': growFullName(request.fullName),
    'pageField[phone]': phone,
    saveCardToken: '0',
    'productData[0][quantity]': '1',
    'productData[0][price]': sum,
    'productData[0][itemDescription]': sanitizeGrowPlainText(request.title, 80) || 'חיוב ועד',
  }
  if (request.email?.trim()) {
    fields['pageField[email]'] = request.email.trim()
  }
  if (request.invoiceNotifyUrl?.trim()) {
    fields.invoiceNotifyUrl = request.invoiceNotifyUrl.trim()
  }

  // Prefer wallet pageCode; createPaymentProcess was verified against sandbox with this flow.
  const posted = await postGrowForm(platform.env, '/createPaymentProcess', fields, platform.xApiKey)
  if (posted.status === 0) {
    return { ok: false, error: 'פסק זמן בחיבור ל-Grow (ארנק)' }
  }
  const parsed = parseGrowPaymentProcessResponse(posted.data)
  if (!parsed) {
    console.error('[grow] createPaymentProcess failed', {
      httpStatus: posted.status,
      err: growErrorMessage(posted.data, ''),
    })
    return { ok: false, error: growErrorMessage(posted.data, 'יצירת תהליך ארנק ב-Grow נכשלה') }
  }
  return {
    ok: true,
    authCode: parsed.authCode,
    processId: parsed.processId,
    processToken: parsed.processToken,
  }
}

export function buildGrowInvoiceNotifyUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  const secret = (process.env.GROW_WEBHOOK_SECRET || '').trim()
  if (!base || !secret) return null
  const url = new URL(`${base}/api/webhook/grow-invoice`)
  url.searchParams.set('token', secret)
  return url.toString()
}
