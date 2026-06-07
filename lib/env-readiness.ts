/**
 * Non-secret env readiness flags for ops / health endpoints.
 */
export type EnvReadinessFlag = {
  key: string
  ok: boolean
  hint?: string
}

export function getEnvReadinessFlags(): EnvReadinessFlag[] {
  const flags: EnvReadinessFlag[] = []

  const whatsappSecret = (process.env.WHATSAPP_APP_SECRET || '').trim()
  flags.push({
    key: 'WHATSAPP_APP_SECRET',
    ok: whatsappSecret.length > 0,
    hint: whatsappSecret.length > 0 ? undefined : 'Webhook signature verification disabled until set in Vercel',
  })

  const cronSecret = (process.env.CRON_SECRET || '').trim()
  flags.push({
    key: 'CRON_SECRET',
    ok: cronSecret.length > 0,
    hint: cronSecret.length > 0 ? undefined : 'Cron routes will reject requests',
  })

  flags.push({
    key: 'RESEND_API_KEY',
    ok: (process.env.RESEND_API_KEY || '').trim().length > 0,
    hint: 'Email sending disabled until set',
  })

  return flags
}

export function isHealthCheckSmsAlertsEnabled(): boolean {
  const v = (process.env.HEALTH_CHECK_SMS_ALERTS || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}
