/** Shared 019SMS helpers (no retry / no DB). */

import { fetchWithTimeout } from '@/lib/fetch-timeout'

export const SMS_019_ENDPOINT = 'https://019sms.co.il/api'
export const SMS_019_SENDER = process.env.SMS_019_SENDER || '972559899132'
export const SMS_019_FALLBACK_SENDER = '972559899132'

type Sms019Env = Record<string, string | undefined>

/** Strip accidental `Bearer ` / quotes when pasting into Vercel. */
export function normalize019SmsToken(raw: string | undefined): string {
  let t = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim()
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim()
  return t
}

/** Primary env; also accept SMS_019_API_TOKEN if already set in Vercel. */
export function read019SmsTokenFromEnv(env: Sms019Env = process.env): string {
  const primary = normalize019SmsToken(env.SMS_019_TOKEN)
  if (primary) return primary
  return normalize019SmsToken(env.SMS_019_API_TOKEN)
}

export type Sms019Auth =
  | { mode: 'token'; username: string; token: string }
  | { mode: 'password'; username: string; password: string }

let passwordFallbackWarned = false

/** נרמול מספר טלפון לפורמט 019SMS: 972xxxxxxxxx */
export function normalizePhone019(phoneNumber: string): string {
  if (!phoneNumber) return ''
  // Digits only — handles spaces, ASCII/Unicode dashes, parentheses, +972, iOS bidi marks.
  let n = phoneNumber.replace(/[\u200e\u200f\ufeff]/g, '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '972' + n.slice(1)
  if (/^5\d{8}$/.test(n)) n = '972' + n
  if (!/^972\d{9}$/.test(n)) return ''
  return n
}

/**
 * 019SMS accepts only registered phone numbers as `source`.
 * Alphanumeric brand names (e.g. "מוקד במקור", "Bino") return XML status 515 and never deliver.
 * Prefer the client-configured phone; otherwise fall back to the platform sender.
 */
export function resolve019SmsSource(senderPreferred: string | null | undefined): string {
  const raw = String(senderPreferred ?? '').trim()
  const fromPreferred = raw ? normalizePhone019(raw) : ''
  if (fromPreferred) return fromPreferred
  if (raw) {
    console.warn('⚠️ SMS_SENDER_NOT_PHONE — using platform sender', {
      invalidSenderPreview: raw.slice(0, 40),
    })
  }
  return normalizePhone019(SMS_019_SENDER) || SMS_019_FALLBACK_SENDER
}

/** Status 512 (unverified phone) or 515 (alphanumeric / unverified source). */
export function is019UnverifiedSourceError(error: string): boolean {
  return /019SMS status 51[25]\b/i.test(error) || /unverified source/i.test(error)
}

/**
 * Resolve 019SMS credentials.
 * Prefer Bearer API token (required by 019SMS after 2027-01-01).
 * Password in XML is a temporary fallback until cutover is verified.
 */
export function get019SmsAuth(env: Sms019Env = process.env): Sms019Auth | null {
  const username = env.SMS_019_USERNAME?.trim() || ''
  if (!username) return null

  const token = read019SmsTokenFromEnv(env)
  if (token) {
    return { mode: 'token', username, token }
  }

  const password = env.SMS_019_PASSWORD?.trim() || ''
  if (password) {
    return { mode: 'password', username, password }
  }

  return null
}

/** @deprecated Use get019SmsAuth — kept for call sites that only need presence. */
export function get019SmsEnv(): Sms019Auth | null {
  return get019SmsAuth()
}

export function is019SmsConfigured(env: Sms019Env = process.env): boolean {
  return get019SmsAuth(env) != null
}

export function build019SmsXml(
  auth: Sms019Auth,
  source: string,
  destination: string,
  message: string
): string {
  const userBlock =
    auth.mode === 'token'
      ? `        <username>${auth.username}</username>`
      : `        <username>${auth.username}</username>
        <password>${auth.password}</password>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<sms>
    <user>
${userBlock}
    </user>
    <source>${source}</source>
    <destinations>
        <phone>${destination}</phone>
    </destinations>
    <message>${message}</message>
</sms>`
}

function parseXmlStatus(xml: string): { status: number; message: string } {
  const statusMatch = xml.match(/<status>(\d+)<\/status>/)
  const msgMatch = xml.match(/<message>(.+?)<\/message>/)
  return {
    status: statusMatch ? parseInt(statusMatch[1], 10) : -1,
    message: msgMatch ? msgMatch[1] : '',
  }
}

function warnPasswordFallbackOnce(auth: Sms019Auth): void {
  if (auth.mode !== 'password' || passwordFallbackWarned) return
  passwordFallbackWarned = true
  console.warn(
    '⚠️ SMS_019_PASSWORD_FALLBACK: using XML password auth. Set SMS_019_TOKEN (Bearer) before 2027-01-01 — 019SMS ends password API support.'
  )
}

/** Test helper — reset one-shot warn latch. */
export function reset019SmsPasswordFallbackWarnForTests(): void {
  passwordFallbackWarned = false
}

/**
 * Single HTTP attempt to 019SMS. Uses 10s timeout.
 * Success = XML status 0. Anything else = error.
 */
export async function post019SmsOnce(
  normalizedPhone: string,
  message: string,
  source: string
): Promise<{ ok: boolean; error: string }> {
  const auth = get019SmsAuth()
  if (!auth) {
    return {
      ok: false,
      error: '019SMS env missing (SMS_019_USERNAME + SMS_019_TOKEN, or temporary SMS_019_PASSWORD)',
    }
  }

  warnPasswordFallbackOnce(auth)

  const payload = build019SmsXml(auth, source, normalizedPhone, message)
  const headers: Record<string, string> = {
    'Content-Type': 'application/xml; charset=UTF-8',
    'User-Agent': 'Bino/1.0',
  }
  if (auth.mode === 'token') {
    headers.Authorization = `Bearer ${auth.token}`
  }

  const response = await fetchWithTimeout(
    SMS_019_ENDPOINT,
    {
      method: 'POST',
      headers,
      body: payload,
    },
    10_000
  )

  if (!response) {
    return { ok: false, error: '019SMS request timeout or network error' }
  }

  const responseText = await response.text()

  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}: ${responseText.slice(0, 200)}` }
  }

  const { status, message: apiMsg } = parseXmlStatus(responseText)

  if (status !== 0) {
    return { ok: false, error: `019SMS status ${status}: ${apiMsg || responseText.slice(0, 100)}` }
  }

  return { ok: true, error: '' }
}
