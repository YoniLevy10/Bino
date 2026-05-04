/** Shared 019SMS helpers (no retry / no DB). */

import { fetchWithTimeout } from '@/lib/fetch-timeout'

export const SMS_019_ENDPOINT = 'https://019sms.co.il/api'
const SMS_019_API_TOKEN = process.env.SMS_019_API_TOKEN
const SMS_019_USERNAME = process.env.SMS_019_USERNAME
export const SMS_019_SENDER = process.env.SMS_019_SENDER || 'Bamakor'

/** 019SMS: source must be Latin alphanumeric, length in a small window (API error 992 if invalid). */
export const SMS_019_SOURCE_MAX = 11
export const SMS_019_SOURCE_MIN = 3

export function effective019SmsSource(preferred: string | undefined | null): string {
  const ascii = String(preferred ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, SMS_019_SOURCE_MAX)
  if (ascii.length >= SMS_019_SOURCE_MIN) return ascii

  const fromEnv = String(SMS_019_SENDER || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, SMS_019_SOURCE_MAX)
  if (fromEnv.length >= SMS_019_SOURCE_MIN) return fromEnv

  const digits = String(SMS_019_SENDER || '0559899132')
    .replace(/\D/g, '')
    .slice(0, SMS_019_SOURCE_MAX)
  if (digits.length >= SMS_019_SOURCE_MIN) return digits

  return 'Bmk'
}

export function normalizePhone019(phoneNumber: string): string {
  if (!phoneNumber) return ''

  let normalized = phoneNumber.replace(/\s|-/g, '')

  if (normalized.startsWith('+')) {
    normalized = normalized.substring(1)
  }

  if (normalized.startsWith('972')) {
    normalized = '0' + normalized.substring(3)
  }

  if (/^5\d{8}$/.test(normalized)) {
    normalized = '0' + normalized
  }

  if (normalized.startsWith('08') || normalized.startsWith('09')) {
    normalized = '05' + normalized.substring(2)
  }

  if (!/^05\d{7,}$/.test(normalized)) {
    return ''
  }

  return normalized
}

export function parse019SmsXml(xmlText: string): { status: number; message: string; shipmentId: string } {
  try {
    const statusMatch = xmlText.match(/<status>(\d+)<\/status>/)
    const status = statusMatch ? parseInt(statusMatch[1], 10) : -1

    const messageMatch = xmlText.match(/<message>(.+?)<\/message>/)
    const message = messageMatch ? messageMatch[1] : ''

    const shipmentMatch = xmlText.match(/<shipment_id>(.+?)<\/shipment_id>/)
    const shipmentId = shipmentMatch ? shipmentMatch[1] : ''

    return { status, message, shipmentId }
  } catch {
    return { status: -1, message: 'Failed to parse response', shipmentId: '' }
  }
}

export function build019SmsXml(username: string, source: string, destination: string, smsMessage: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sms>
    <user>
        <username>${username}</username>
    </user>
    <source>${source}</source>
    <destinations>
        <phone>${destination}</phone>
    </destinations>
    <message>${smsMessage}</message>
</sms>`
}

export function get019SmsEnv(): { token: string; username: string } | null {
  if (!SMS_019_API_TOKEN || !SMS_019_USERNAME) return null
  return { token: SMS_019_API_TOKEN, username: SMS_019_USERNAME }
}

/**
 * Single HTTP attempt to 019SMS. Uses 10s timeout.
 */
export async function post019SmsOnce(
  normalizedPhone: string,
  message: string,
  source: string
): Promise<{ ok: boolean; error: string; shipmentId?: string }> {
  const env = get019SmsEnv()
  if (!env) {
    return { ok: false, error: '019SMS env missing (SMS_019_API_TOKEN / SMS_019_USERNAME)' }
  }

  const payload = build019SmsXml(env.username, source, normalizedPhone, message)

  const response = await fetchWithTimeout(
    SMS_019_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        Authorization: `Bearer ${env.token}`,
      },
      body: payload,
    },
    10_000
  )

  if (!response) {
    return { ok: false, error: '019SMS request timeout or network error' }
  }

  const responseText = await response.text()
  const { status, message: responseMessage, shipmentId } = parse019SmsXml(responseText)

  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${responseMessage || responseText.slice(0, 200)}`,
    }
  }

  if (status !== 0) {
    return { ok: false, error: `019 status ${status}: ${responseMessage || 'unknown'}` }
  }

  return { ok: true, error: '', shipmentId }
}
