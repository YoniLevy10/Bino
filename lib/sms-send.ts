/**
 * 019SMS notification service for internal staff
 *
 * Retries / timeout / failed_notifications persistence: see `lib/sms.ts`.
 */

import { send019StaffSms } from '@/lib/sms'

/** Primary manager SMS destination — overrides per-project when set */
export function getManagerPhoneFromEnv(): string | undefined {
  const v = process.env.MANAGER_PHONE
  return v && String(v).trim() ? String(v).trim() : undefined
}

/** Send SMS to worker via 019SMS (3 retries, 10s timeout each). */
export async function sendWorkerSMS(
  phoneNumber: string,
  message: string,
  senderName?: string | null,
  clientId?: string | null
): Promise<boolean> {
  return send019StaffSms(phoneNumber, message, senderName, { channel: 'worker_sms', clientId })
}

/** Send SMS to manager via 019SMS (3 retries, 10s timeout each). */
export async function sendManagerSMS(
  phoneNumber: string,
  message: string,
  senderName?: string | null,
  clientId?: string | null
): Promise<boolean> {
  const stripped = phoneNumber.replace(/[\s\-+]/g, '')
  const normalized = stripped.startsWith('0') ? '972' + stripped.slice(1) : stripped
  console.log('📱 sendManagerSMS normalized:', normalized)
  return send019StaffSms(normalized, message, senderName, { channel: 'manager_sms', clientId })
}

export const WHATSAPP_STAFF_NOTIFICATIONS_ARCHIVED = {
  reason: 'WhatsApp templates not yet approved by Meta',
  status: 'disabled',
  currentChannel: 'SMS_019',
}
