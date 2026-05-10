/** Shared 019SMS helpers (no retry / no DB). */

import { fetchWithTimeout } from '@/lib/fetch-timeout'

export const SMS_019_ENDPOINT = 'https://api.019sms.co.il/Send'
const SMS_019_USERNAME = process.env.SMS_019_USERNAME
const SMS_019_PASSWORD = process.env.SMS_019_PASSWORD
export const SMS_019_SENDER = process.env.SMS_019_SENDER || '972559899132'

/** נרמול מספר טלפון לפורמט 019SMS: 972xxxxxxxxx */
export function normalizePhone019(phoneNumber: string): string {
  if (!phoneNumber) return ''

  let n = phoneNumber.replace(/[\s\-+]/g, '')

  // 05x → 972x
  if (n.startsWith('0')) {
    n = '972' + n.slice(1)
  }

  // 5x (without leading 0) → 9725x
  if (/^5\d{8}$/.test(n)) {
    n = '972' + n
  }

  // Must be 972 + 9 digits
  if (!/^972\d{9}$/.test(n)) return ''

  return n
}

export function get019SmsEnv(): { username: string; password: string } | null {
  if (!SMS_019_USERNAME || !SMS_019_PASSWORD) return null
  return { username: SMS_019_USERNAME, password: SMS_019_PASSWORD }
}

/**
 * Single HTTP attempt to 019SMS (form-urlencoded).
 * Response: plain text "OK" on success, anything else is failure.
 */
export async function post019SmsOnce(
  normalizedPhone: string,
  message: string,
  from: string
): Promise<{ ok: boolean; error: string }> {
  const env = get019SmsEnv()
  if (!env) {
    return { ok: false, error: '019SMS env missing (SMS_019_USERNAME / SMS_019_PASSWORD)' }
  }

  const body = new URLSearchParams({
    UserName: env.username,
    Password: env.password,
    To: normalizedPhone,
    From: from,
    Text: message,
  })

  const response = await fetchWithTimeout(
    SMS_019_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Bamakor/1.0 (+https://bamakor.com)',
      },
      body: body.toString(),
    },
    10_000
  )

  if (!response) {
    return { ok: false, error: '019SMS request timeout or network error' }
  }

  const responseText = (await response.text()).trim()

  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}: ${responseText.slice(0, 200)}` }
  }

  if (responseText !== 'OK') {
    return { ok: false, error: `019SMS error: ${responseText.slice(0, 200)}` }
  }

  return { ok: true, error: '' }
}
