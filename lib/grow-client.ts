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
  apiKey: string
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
        'x-api-key': apiKey,
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
  if (typeof rec.err === 'string' && rec.err.trim()) return rec.err.trim()
  if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim()
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim()
  return fallback
}

export function parseGrowPaymentLinkResponse(data: unknown): {
  url: string
  paymentLinkProcessId: string
  paymentLinkProcessToken: string | null
} | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  const status = rec.status
  if (status !== 1 && status !== '1') return null
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
  const fields: Record<string, string> = {
    apiKey: platform.apiKey,
    userId: request.userId.trim(),
    pageCode: platform.pageCode,
    paymentLinkType: '1',
    isActive: '1',
    chargeType: '1',
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
    'products[data][0][price]': String(amount),
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

  const posted = await postGrowForm(platform.env, '/createPaymentLink', fields, platform.apiKey)
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
): Promise<{ ok: boolean }> {
  if (!platform || !request.transactionId || !request.transactionToken) {
    return { ok: false }
  }
  const fields: Record<string, string> = {
    apiKey: platform.apiKey,
    pageCode: platform.pageCode,
    transactionId: request.transactionId,
    transactionToken: request.transactionToken,
    transactionTypeId: request.transactionTypeId || '1',
    paymentType: request.paymentType || '2',
  }
  const posted = await postGrowForm(platform.env, '/approveTransaction', fields, platform.apiKey)
  if (posted.status === 0) return { ok: false }
  const rec = posted.data && typeof posted.data === 'object' ? (posted.data as { status?: unknown }) : null
  return { ok: rec?.status === 1 || rec?.status === '1' || posted.status === 200 }
}
