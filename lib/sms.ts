import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  normalizePhone019,
  post019SmsOnce,
  SMS_019_SENDER,
} from '@/lib/sms-019-core'

const RETRIES = 3
const BETWEEN_MS = 2000

const DEFAULT_MAX_SMS_CHARS = 900

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function getMaxSmsChars(): number {
  const raw = process.env.SMS_019_MAX_CHARS
  const n = raw ? Number(String(raw).trim()) : NaN
  // keep this conservative; 019SMS rejects oversized payloads with status 989
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_SMS_CHARS
  return Math.max(50, Math.floor(n))
}

function clampSmsMessage(message: string): { message: string; truncated: boolean; originalLength: number } {
  const originalLength = message.length
  const max = getMaxSmsChars()

  // Normalize newlines and trim. Keep content as-is otherwise (Hebrew is supported).
  const normalized = message.replace(/\r\n/g, '\n').trim()
  if (normalized.length <= max) {
    return { message: normalized, truncated: normalized.length !== originalLength, originalLength }
  }

  // Use ASCII suffix to avoid any provider quirks.
  const suffix = '...'
  const sliceTo = Math.max(1, max - suffix.length)
  return {
    message: `${normalized.slice(0, sliceTo)}${suffix}`,
    truncated: true,
    originalLength,
  }
}

export type Send019SmsRetryContext = {
  clientId?: string | null
  channel: string
}

/**
 * 019SMS: up to 3 attempts, 2s backoff, 10s timeout per attempt.
 * Logs to failed_notifications after final failure.
 */
export async function send019SmsWithRetries(
  normalizedPhone: string,
  message: string,
  from: string,
  ctx: Send019SmsRetryContext
): Promise<boolean> {
  let lastErr = 'unknown'

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const result = await post019SmsOnce(normalizedPhone, message, from)
    if (result.ok) {
      console.log('✅ SMS_019_SENT', { channel: ctx.channel, destination: normalizedPhone })
      return true
    }
    lastErr = result.error
    console.error(`❌ SMS_019_ATTEMPT_${attempt}_${RETRIES}_FAILED`, {
      channel: ctx.channel,
      destination: normalizedPhone,
      detail: lastErr,
    })
    if (attempt < RETRIES) await sleep(BETWEEN_MS)
  }

  console.error('❌ SMS_019_FINAL_FAILURE after retries', {
    channel: ctx.channel,
    destination: normalizedPhone,
    lastErr,
  })

  try {
    const admin = getSupabaseAdmin()
    await admin.from('failed_notifications').insert({
      client_id: ctx.clientId ?? null,
      channel: ctx.channel,
      destination: normalizedPhone,
      payload: message.length > 2000 ? `${message.slice(0, 2000)}…` : message,
      error_message: lastErr.length > 2000 ? `${lastErr.slice(0, 2000)}…` : lastErr,
    })
  } catch (e) {
    console.error('⚠️ failed_notifications insert skipped or failed:', e instanceof Error ? e.message : String(e))
  }

  return false
}

export async function send019StaffSms(
  phoneNumber: string,
  message: string,
  senderPreferred: string | null | undefined,
  ctx: Send019SmsRetryContext
): Promise<boolean> {
  if (!phoneNumber) {
    console.error('❌ SMS_SEND_FAILURE: phoneNumber is missing')
    return false
  }
  if (!message) {
    console.error('❌ SMS_SEND_FAILURE: message is empty')
    return false
  }

  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction && !get019SmsEnvPresent()) {
    console.log('📱 SMS_DEVELOPMENT: Not sending SMS in development mode (missing credentials)')
    console.log('📱 SMS_RECIPIENT:', phoneNumber)
    console.log('📱 SMS_MESSAGE_LENGTH:', message.length)
    return true
  }

  if (!get019SmsEnvPresent()) {
    console.error('❌ SMS_SEND_FAILURE: 019SMS credentials not configured (SMS_019_USERNAME / SMS_019_PASSWORD)')
    return false
  }

  const normalizedPhone = normalizePhone019(phoneNumber)
  if (!normalizedPhone) {
    console.error('❌ SMS_SEND_FAILURE: phoneNumber could not be normalized', { originalPhone: phoneNumber })
    return false
  }

  const clamped = clampSmsMessage(message)
  if (!clamped.message) {
    console.error('❌ SMS_SEND_FAILURE: message became empty after normalization', {
      channel: ctx.channel,
      destination: normalizedPhone,
    })
    return false
  }

  const rawSource = String(senderPreferred ?? SMS_019_SENDER).trim()
  // 019SMS only accepts registered phone numbers as sender — never alphanumeric
  const source = normalizePhone019(rawSource) || '972559899132'

  console.log('📱 SMS_SEND_START', {
    channel: ctx.channel,
    normalizedPhone,
    messageLength: clamped.message.length,
    ...(clamped.truncated
      ? { truncated: true, originalLength: clamped.originalLength, maxChars: getMaxSmsChars() }
      : {}),
  })

  return send019SmsWithRetries(normalizedPhone, clamped.message, source, ctx)
}

function get019SmsEnvPresent(): boolean {
  return !!(process.env.SMS_019_USERNAME && process.env.SMS_019_PASSWORD)
}
