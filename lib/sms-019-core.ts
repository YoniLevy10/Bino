/** Shared 019SMS helpers (no retry / no DB). */

import { fetchWithTimeout } from '@/lib/fetch-timeout'

export const SMS_019_ENDPOINT = 'https://019sms.co.il/api'
const SMS_019_USERNAME = process.env.SMS_019_USERNAME
const SMS_019_PASSWORD = process.env.SMS_019_PASSWORD
export const SMS_019_SENDER = process.env.SMS_019_SENDER || '972559899132'

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

export function get019SmsEnv(): { username: string; password: string } | null {
  if (!SMS_019_USERNAME || !SMS_019_PASSWORD) return null
  return { username: SMS_019_USERNAME, password: SMS_019_PASSWORD }
}

function buildXml(username: string, password: string, source: string, destination: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sms>
    <user>
        <username>${username}</username>
        <password>${password}</password>
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

/**
 * Single HTTP attempt to 019SMS. Uses 10s timeout.
 * Success = XML status 0. Anything else = error.
 */
export async function post019SmsOnce(
  normalizedPhone: string,
  message: string,
  source: string
): Promise<{ ok: boolean; error: string }> {
  const env = get019SmsEnv()
  if (!env) {
    return { ok: false, error: '019SMS env missing (SMS_019_USERNAME / SMS_019_PASSWORD)' }
  }

  const payload = buildXml(env.username, env.password, source, normalizedPhone, message)

  const response = await fetchWithTimeout(
    SMS_019_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8',
        'User-Agent': 'Bino/1.0',
      },
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
