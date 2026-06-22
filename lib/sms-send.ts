/**
 * 019SMS notification service for internal staff
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

export type WorkerSmsBatchResult = {
  ok: boolean
  sent: number
  total: number
  phones: string[]
}

/** Send the same SMS to every distinct worker phone (primary + extras). */
export async function sendWorkerSMSAll(
  phones: string[],
  message: string,
  senderName?: string | null,
  clientId?: string | null
): Promise<WorkerSmsBatchResult> {
  const unique = [...new Set(phones.map((p) => p.trim()).filter(Boolean))]
  if (unique.length === 0) {
    return { ok: false, sent: 0, total: 0, phones: [] }
  }

  let sent = 0
  for (const phone of unique) {
    const success = await sendWorkerSMS(phone, message, senderName, clientId)
    if (success) sent++
  }

  return { ok: sent === unique.length, sent, total: unique.length, phones: unique }
}

/** Send SMS to manager via 019SMS (3 retries, 10s timeout each). */
export async function sendManagerSMS(
  phoneNumber: string,
  message: string,
  senderName?: string | null,
  clientId?: string | null
): Promise<boolean> {
  return send019StaffSms(phoneNumber, message, senderName, { channel: 'manager_sms', clientId })
}

/** Send SMS to resident/reporter via 019SMS (3 retries, 10s timeout each). */
export async function sendResidentSMS(
  phoneNumber: string,
  message: string,
  senderName?: string | null,
  clientId?: string | null
): Promise<boolean> {
  return send019StaffSms(phoneNumber, message, senderName, { channel: 'resident_sms', clientId })
}
