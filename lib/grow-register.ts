import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { getPublicAppUrl } from '@/lib/public-app-url'
import {
  isGrowRegisterConfigured,
  readGrowRegisterConfig,
  type GrowRegisterConfig,
} from '@/lib/grow-config'
import { primaryGrowWebhookToken, readGrowRegisterWebhookSecret } from '@/lib/grow-webhook'
import { normalizePhone019 } from '@/lib/sms-019-core'

const TIMEOUT_MS = 20_000

export type GrowGetLinkRequest = {
  businessNumber: string
  phone: string
  /** Public merchant page for Grow plugin audit. */
  website?: string | null
  sendSms?: boolean
}

export type GrowGetLinkResult =
  | {
      ok: true
      url: string
      encryptedLead: string
      errId?: number
    }
  | {
      ok: false
      error: string
      errId?: number
      /** Grow error 17 / 149 etc. */
      code?: 'OPEN_PROCESS' | 'EXISTING_BUSINESS' | 'BAD_PHONE' | 'NOT_CONFIGURED' | 'OTHER'
    }

function toIsraeliMobile(raw: string): string | null {
  const normalized = normalizePhone019(raw.trim())
  if (normalized.startsWith('972') && normalized.length === 12) {
    return `0${normalized.slice(3)}`
  }
  const digits = raw.replace(/\D/g, '')
  if (/^05\d{8}$/.test(digits)) return digits
  return null
}

function mapGetLinkError(errId: number | undefined, message: string): GrowGetLinkResult {
  if (errId === 17) {
    return {
      ok: false,
      error: message || 'ללקוח קיים תהליך הרשמה פתוח — פנו לתמיכת Grow לחיבור המשווק.',
      errId,
      code: 'OPEN_PROCESS',
    }
  }
  if (errId === 149) {
    return {
      ok: false,
      error:
        message ||
        'עסק קיים במשולם/Grow. הדביקו את ה-userId הקיים בהגדרות או פנו ל-Grow לחיבור לפלטפורמת Bino.',
      errId,
      code: 'EXISTING_BUSINESS',
    }
  }
  if (errId === 13) {
    return { ok: false, error: message || 'מספר הטלפון אינו תקין', errId, code: 'BAD_PHONE' }
  }
  return { ok: false, error: message || 'הזנקת הרשמה ל-Grow נכשלה', errId, code: 'OTHER' }
}

export async function createGrowRegistrationLink(
  request: GrowGetLinkRequest,
  config: GrowRegisterConfig | null = readGrowRegisterConfig()
): Promise<GrowGetLinkResult> {
  if (!config) {
    return {
      ok: false,
      error: 'חסרים מפתחות הרשמת Grow בשרת (GROW_REGISTER_X_API_KEY / GROW_MARKETER / GROW_PRICE_QUOTE).',
      code: 'NOT_CONFIGURED',
    }
  }

  const phone = toIsraeliMobile(request.phone)
  if (!phone) {
    return { ok: false, error: 'נדרש נייד ישראלי תקין (05XXXXXXXX)', code: 'BAD_PHONE' }
  }

  const businessNumber = request.businessNumber.replace(/\D/g, '')
  if (businessNumber.length < 8 || businessNumber.length > 9) {
    return { ok: false, error: 'מספר עוסק / ת״ז אינו תקין', code: 'OTHER' }
  }

  const body = {
    marketer: config.marketer,
    business_number: businessNumber,
    phone,
    price_quote: config.priceQuote,
    is_direct_debit: config.isDirectDebit,
    website: (request.website || '').trim(),
    is_send_sms: request.sendSms === false ? 0 : 1,
  }

  const res = await fetchWithTimeout(
    `${config.baseUrl.replace(/\/$/, '')}/GetLink`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Bino-Grow-Register/1.0',
        'x-api-key': config.xApiKey,
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_MS
  )

  if (!res) {
    return { ok: false, error: 'פסק זמן בחיבור ל-Grow (הרשמה)', code: 'OTHER' }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'תשובת Grow לא תקינה', code: 'OTHER' }
  }

  const rec = data as {
    status?: unknown
    err?: unknown
    data?: { url?: unknown; encrypted_lead?: unknown } | string
  }

  if (rec.status !== 1 && rec.status !== '1') {
    let errId: number | undefined
    let message = 'הזנקת הרשמה נכשלה'
    if (rec.err && typeof rec.err === 'object') {
      const e = rec.err as { id?: unknown; message?: unknown }
      if (typeof e.id === 'number') errId = e.id
      if (typeof e.id === 'string' && /^\d+$/.test(e.id)) errId = Number(e.id)
      if (typeof e.message === 'string' && e.message.trim()) message = e.message.trim()
    } else if (typeof rec.err === 'string' && rec.err.trim()) {
      message = rec.err.trim()
    }
    return mapGetLinkError(errId, message)
  }

  const inner = rec.data && typeof rec.data === 'object' ? rec.data : null
  const url = typeof inner?.url === 'string' ? inner.url.trim() : ''
  const encryptedLead =
    typeof inner?.encrypted_lead === 'string' ? inner.encrypted_lead.trim() : ''
  if (!url || !encryptedLead) {
    return { ok: false, error: 'Grow לא החזיר קישור הרשמה או קוד מעקב', code: 'OTHER' }
  }

  return { ok: true, url, encryptedLead }
}

/** Public URL Grow should call after merchant approval — must be configured at Grow for the marketer. */
export function buildGrowRegisterWebhookUrl(): string | null {
  const base = getPublicAppUrl()
  const token = primaryGrowWebhookToken(readGrowRegisterWebhookSecret())
  if (!base || !token) return null
  const url = new URL(`${base}/api/webhook/grow-register`)
  url.searchParams.set('token', token)
  return url.toString()
}

export function isGrowRegisterReady(): boolean {
  return isGrowRegisterConfigured() && Boolean(buildGrowRegisterWebhookUrl())
}

export type GrowRegisterWebhookPayload = {
  trackingCode: string | null
  userId: string | null
  apiKey: string | null
  businessTitle: string | null
  name: string | null
  phone: string | null
  packageName: string | null
  trackingStatusId: string | null
  trackingStatusMessage: string | null
  approved: boolean
  rejected: boolean
}

export function extractGrowRegisterWebhook(payload: unknown): GrowRegisterWebhookPayload {
  const rec =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)
      ? (rec.data as Record<string, unknown>)
      : rec

  const tracking =
    data.tracking_status && typeof data.tracking_status === 'object'
      ? (data.tracking_status as Record<string, unknown>)
      : null

  const statusId = tracking?.id == null ? null : String(tracking.id)
  const statusMsg = tracking?.message == null ? null : String(tracking.message)
  const approved =
    statusId === '3' ||
    (typeof statusMsg === 'string' && /הוקם בהצלחה|אושר/.test(statusMsg))
  const rejected =
    statusId === '4' ||
    (typeof statusMsg === 'string' && /נדח|לא אושר|דחי/.test(statusMsg))

  const str = (v: unknown) => (v == null || v === '' ? null : String(v).trim())

  return {
    trackingCode: str(data.tracking_code),
    userId: str(data.user_id),
    apiKey: str(data.api_key),
    businessTitle: str(data.business_title),
    name: str(data.name),
    phone: str(data.phone),
    packageName: str(data.package_name),
    trackingStatusId: statusId,
    trackingStatusMessage: statusMsg,
    approved,
    rejected,
  }
}
